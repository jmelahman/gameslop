package db

import (
	"path/filepath"
	"testing"
)

func TestOpenAppliesMigrations(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")

	db, err := Open(path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}

	var applied int
	if err := db.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&applied); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if applied < 1 {
		t.Fatalf("expected at least one migration applied, got %d", applied)
	}

	for _, table := range []string{
		"players", "item_catalog", "hero_catalog", "runs", "run_state",
		"encounters", "run_history", "art_assets",
	} {
		var name string
		err := db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
		if err != nil {
			t.Fatalf("table %s not found: %v", table, err)
		}
	}

	var players int
	if err := db.QueryRow(`SELECT COUNT(*) FROM players`).Scan(&players); err != nil {
		t.Fatalf("count players: %v", err)
	}
	if players != 1 {
		t.Fatalf("expected 1 seeded player, got %d", players)
	}

	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	db2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db2.Close()

	var appliedAgain int
	if err := db2.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&appliedAgain); err != nil {
		t.Fatalf("recount schema_migrations: %v", err)
	}
	if appliedAgain != applied {
		t.Fatalf("migration count changed on reopen: %d -> %d", applied, appliedAgain)
	}
}
