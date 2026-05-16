package store

import (
	"context"
	"database/sql"

	"github.com/jmelahman/gameslop/internal/model"
)

// HistoryStore wraps SQL access to run_history.
type HistoryStore struct {
	db *sql.DB
}

// NewHistoryStore wraps db.
func NewHistoryStore(db *sql.DB) *HistoryStore { return &HistoryStore{db: db} }

// HistoryEntry is one row of run_history surfaced to the API layer.
type HistoryEntry struct {
	ID          int64           `json:"id"`
	RunID       int64           `json:"run_id"`
	HeroID      string          `json:"hero_id"`
	DaysReached int             `json:"days_reached"`
	Outcome     model.RunStatus `json:"outcome"`
	FinishedAt  int64           `json:"finished_at"`
}

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

// List returns up to `limit` history rows for the player, newest first.
// `offset` skips rows. Both default to sane values when ≤ 0.
func (s *HistoryStore) List(ctx context.Context, playerID int64, limit, offset int) ([]HistoryEntry, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, run_id, hero_id, days_reached, outcome, finished_at
		FROM run_history
		WHERE player_id = ?
		ORDER BY finished_at DESC, id DESC
		LIMIT ? OFFSET ?`,
		playerID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]HistoryEntry, 0, limit)
	for rows.Next() {
		var e HistoryEntry
		var outcome string
		if err := rows.Scan(&e.ID, &e.RunID, &e.HeroID, &e.DaysReached, &outcome, &e.FinishedAt); err != nil {
			return nil, err
		}
		e.Outcome = model.RunStatus(outcome)
		out = append(out, e)
	}
	return out, rows.Err()
}

// Count returns the total number of run_history rows for the player. Used by
// the /stats page to size paginated controls.
func (s *HistoryStore) Count(ctx context.Context, playerID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM run_history WHERE player_id = ?`, playerID,
	).Scan(&n)
	return n, err
}

// Clear deletes every run_history row for the player. Only the finished
// runs are removed; an active run continues unaffected. Returns the number
// of rows deleted.
func (s *HistoryStore) Clear(ctx context.Context, playerID int64) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM run_history WHERE player_id = ?`, playerID,
	)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
