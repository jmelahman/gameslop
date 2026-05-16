package store

import (
	"context"
	"database/sql"

	"github.com/jmelahman/gameslop/internal/model"
)

// HistoryStore wraps SQL writes to run_history.
type HistoryStore struct {
	db *sql.DB
}

// NewHistoryStore wraps db.
func NewHistoryStore(db *sql.DB) *HistoryStore { return &HistoryStore{db: db} }

// Record inserts a single run_history row. Caller is responsible for the
// surrounding lifecycle (marking runs.status, clearing run_state, etc.).
func (s *HistoryStore) Record(
	ctx context.Context,
	playerID int64,
	runID int64,
	heroID string,
	daysReached int,
	outcome model.RunStatus,
	finishedAt int64,
) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO run_history (player_id, run_id, hero_id, days_reached, outcome, finished_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		playerID, runID, heroID, daysReached, string(outcome), finishedAt,
	)
	return err
}
