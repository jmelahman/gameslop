package catalog

import (
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"

	"github.com/jmelahman/gameslop/internal/model"
)

//go:embed items/*.json heroes/*.json
var catalogFS embed.FS

// Catalog holds the in-memory copy of the static game data.
type Catalog struct {
	Items  map[string]model.ItemDef
	Heroes map[string]model.HeroDef
}

// Load reads every embedded item and hero JSON file, decodes it into
// model structs, and upserts a row per entry into the corresponding catalog
// table via INSERT OR IGNORE. The decoded data is also returned in-memory.
func Load(db *sql.DB) (*Catalog, error) {
	c := &Catalog{
		Items:  map[string]model.ItemDef{},
		Heroes: map[string]model.HeroDef{},
	}

	if err := walkJSON(catalogFS, "items", func(raw []byte) error {
		var defs []json.RawMessage
		if err := json.Unmarshal(raw, &defs); err != nil {
			return err
		}
		for _, r := range defs {
			var it model.ItemDef
			if err := json.Unmarshal(r, &it); err != nil {
				return err
			}
			it.Raw = r
			c.Items[it.ID] = it
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("load items: %w", err)
	}

	if err := walkJSON(catalogFS, "heroes", func(raw []byte) error {
		var defs []json.RawMessage
		if err := json.Unmarshal(raw, &defs); err != nil {
			return err
		}
		for _, r := range defs {
			var h model.HeroDef
			if err := json.Unmarshal(r, &h); err != nil {
				return err
			}
			h.Raw = r
			c.Heroes[h.ID] = h
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("load heroes: %w", err)
	}

	if err := seed(db, c); err != nil {
		return nil, err
	}
	return c, nil
}

func walkJSON(efs embed.FS, dir string, fn func([]byte) error) error {
	entries, err := fs.ReadDir(efs, dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		body, err := efs.ReadFile(dir + "/" + e.Name())
		if err != nil {
			return err
		}
		if err := fn(body); err != nil {
			return fmt.Errorf("%s: %w", e.Name(), err)
		}
	}
	return nil
}

func seed(db *sql.DB, c *Catalog) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	itemStmt, err := tx.Prepare(`INSERT OR IGNORE INTO item_catalog
		(id, name, tier, size, buy_cost, sell_value, effect_json)
		VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer itemStmt.Close()
	for _, it := range c.Items {
		body := it.Raw
		if len(body) == 0 {
			body, err = json.Marshal(it)
			if err != nil {
				return err
			}
		}
		if _, err := itemStmt.Exec(it.ID, it.Name, string(it.Tier), it.Size, it.BuyCost, it.SellValue, string(body)); err != nil {
			return fmt.Errorf("seed item %s: %w", it.ID, err)
		}
	}

	heroStmt, err := tx.Prepare(`INSERT OR IGNORE INTO hero_catalog
		(id, name, description, starting_hp, effect_json)
		VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer heroStmt.Close()
	for _, h := range c.Heroes {
		body := h.Raw
		if len(body) == 0 {
			body, err = json.Marshal(h)
			if err != nil {
				return err
			}
		}
		if _, err := heroStmt.Exec(h.ID, h.Name, h.Description, h.StartingHP, string(body)); err != nil {
			return fmt.Errorf("seed hero %s: %w", h.ID, err)
		}
	}

	return tx.Commit()
}
