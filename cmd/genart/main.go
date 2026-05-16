// genart drives a local ComfyUI server to produce item icon art via Flux
// Schnell.
//
//	go run ./cmd/genart                        # only items missing a PNG (default)
//	go run ./cmd/genart --all                  # regenerate every catalog item
//	go run ./cmd/genart --item rusty_sword     # one item, deterministic seed
//	go run ./cmd/genart --item rusty_sword --reroll
//	                                           # one item, fresh seed → new image
//
// PNGs land in web/public/items/<id>.png and an art_assets row is upserted
// (prompt, seed, model, sha256) so we can audit what produced what.
package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"syscall"
	"time"

	"github.com/jmelahman/gameslop/internal/art"
	"github.com/jmelahman/gameslop/internal/catalog"
	"github.com/jmelahman/gameslop/internal/db"
	"github.com/jmelahman/gameslop/internal/model"
)

const (
	defaultBaseURL = "http://localhost:8188"
	outputDir      = "web/public/items"
)

func main() {
	all := flag.Bool("all", false, "regenerate every catalog item (overrides --missing-only)")
	missingOnly := flag.Bool("missing-only", true, "only generate art for items without a PNG (default)")
	itemID := flag.String("item", "", "generate just this one item id (ignores --missing-only)")
	reroll := flag.Bool("reroll", false, "use a fresh seed for the targeted items (otherwise seed is sha256(item.id))")
	baseURL := flag.String("comfy-url", envOr("GENART_COMFY_URL", defaultBaseURL), "ComfyUI base URL")
	dbPath := flag.String("db", envOr("GAMESLOP_DB", "gameslop.db"), "SQLite database path")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	database, err := db.Open(*dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer database.Close()

	cat, err := catalog.Load(database)
	if err != nil {
		log.Fatalf("load catalog: %v", err)
	}

	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		log.Fatalf("mkdir %s: %v", outputDir, err)
	}

	targets, err := selectTargets(cat, *itemID, *all, *missingOnly, *reroll)
	if err != nil {
		log.Fatalf("%v", err)
	}
	if len(targets) == 0 {
		log.Printf("nothing to generate (every catalog item already has art; pass --all or --reroll to redo)")
		return
	}

	client := art.NewClient(*baseURL)
	modelName, err := client.ModelTitle(ctx)
	if err != nil {
		log.Fatalf("contact ComfyUI at %s: %v\n(is the container up? docker compose up -d comfyui)", *baseURL, err)
	}
	if modelName == "" {
		modelName = "unknown"
	}
	log.Printf("connected to %s (model: %q); generating %d item(s)", *baseURL, modelName, len(targets))

	// One shared nonce per --reroll invocation: the per-item ID is already
	// folded into the seed, so we don't need a fresh nonce per loop iter.
	var rerollNonce string
	if *reroll {
		rerollNonce = strconv.FormatInt(time.Now().UnixNano(), 16)
	}

	startedAll := time.Now()
	for i, item := range targets {
		select {
		case <-ctx.Done():
			log.Printf("interrupted after %d/%d", i, len(targets))
			return
		default:
		}

		seed := art.SeedFor(item.ID, rerollNonce)
		prompt := art.BuildPrompt(item)

		log.Printf("[%d/%d] %s … (seed=%d)", i+1, len(targets), item.ID, seed)
		started := time.Now()
		img, returnedSeed, err := client.Generate(ctx, prompt, seed)
		if err != nil {
			log.Fatalf("[%d/%d] %s: %v", i+1, len(targets), item.ID, err)
		}

		path := filepath.Join(outputDir, item.ID+".png")
		if err := os.WriteFile(path, img, 0o644); err != nil {
			log.Fatalf("write %s: %v", path, err)
		}
		sum := sha256.Sum256(img)
		if err := upsertArtAsset(database, item.ID, prompt, returnedSeed, modelName, hex.EncodeToString(sum[:])); err != nil {
			log.Fatalf("upsert art_assets %s: %v", item.ID, err)
		}

		elapsed := time.Since(started)
		eta := time.Duration(float64(elapsed) * float64(len(targets)-(i+1)))
		log.Printf("[%d/%d] %s done in %s (ETA remaining: %s)",
			i+1, len(targets), item.ID, elapsed.Round(time.Second), eta.Round(time.Second))
	}
	log.Printf("generated %d image(s) in %s", len(targets), time.Since(startedAll).Round(time.Second))
}

func selectTargets(cat *catalog.Catalog, itemID string, all, missingOnly, reroll bool) ([]model.ItemDef, error) {
	if itemID != "" {
		it, ok := cat.Item(itemID)
		if !ok {
			return nil, fmt.Errorf("unknown item id %q", itemID)
		}
		return []model.ItemDef{it}, nil
	}
	items := cat.All()
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	if all || reroll {
		return items, nil
	}
	if !missingOnly {
		return items, nil
	}
	filtered := items[:0]
	for _, it := range items {
		if _, err := os.Stat(filepath.Join(outputDir, it.ID+".png")); os.IsNotExist(err) {
			filtered = append(filtered, it)
		}
	}
	return filtered, nil
}

func upsertArtAsset(database *sql.DB, itemID, prompt string, seed int64, modelName, sha string) error {
	_, err := database.Exec(`INSERT INTO art_assets (item_id, prompt, seed, model, generated_at, sha256)
		VALUES (?, ?, ?, ?, strftime('%s','now'), ?)
		ON CONFLICT(item_id) DO UPDATE SET
			prompt=excluded.prompt,
			seed=excluded.seed,
			model=excluded.model,
			generated_at=excluded.generated_at,
			sha256=excluded.sha256`,
		itemID, prompt, seed, modelName, sha)
	return err
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
