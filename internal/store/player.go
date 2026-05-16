package store

import "database/sql"

// PlayerStore exposes player row operations.
type PlayerStore struct {
	db *sql.DB
}

// NewPlayerStore wraps db.
func NewPlayerStore(db *sql.DB) *PlayerStore { return &PlayerStore{db: db} }

// DefaultPlayerID is the single seeded local-player row.
const DefaultPlayerID int64 = 1
