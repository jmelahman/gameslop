package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"

	"github.com/jmelahman/gameslop/internal/model"
)

// ErrNoEncounter is returned when no encounter row exists for the lookup key.
var ErrNoEncounter = errors.New("no encounter")

// EncounterStore wraps SQL access for the encounters table.
type EncounterStore struct {
	db *sql.DB
}

// NewEncounterStore wraps db.
func NewEncounterStore(db *sql.DB) *EncounterStore { return &EncounterStore{db: db} }

// PersistedEncounter is what the encounter store returns to callers: the
// opponent board, the seed used, the resolved status, and (optionally) the
// stored combat log.
type PersistedEncounter struct {
	ID            int64                 `json:"id"`
	RunID         int64                 `json:"run_id"`
	Day           int                   `json:"day"`
	OpponentHP    int                   `json:"opponent_hp"`
	OpponentBoard []model.BoardItem     `json:"opponent_board"`
	Seed          int64                 `json:"seed"`
	Status        model.EncounterStatus `json:"status"`
	Result        *model.CombatResult   `json:"result,omitempty"`
}

// opponentJSON is the on-disk shape of the opponent column: HP + items in one
// blob keeps schema minimal until procedural generation lands.
type opponentJSON struct {
	HP    int               `json:"hp"`
	Items []model.BoardItem `json:"items"`
}

// Resolve writes (or replaces) the encounter row for (runID, day) with the
// resolved combat result. Day uniqueness is enforced via UPSERT.
func (s *EncounterStore) Resolve(
	ctx context.Context,
	runID int64,
	day int,
	opponentHP int,
	opponentBoard []model.BoardItem,
	seed int64,
	result *model.CombatResult,
) error {
	oppJSON, err := json.Marshal(opponentJSON{HP: opponentHP, Items: opponentBoard})
	if err != nil {
		return err
	}
	logJSON, err := json.Marshal(result)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO encounters (run_id, day, opponent_board, seed, status, combat_log)
		VALUES (?, ?, ?, ?, 'resolved', ?)
		ON CONFLICT(run_id, day) DO UPDATE SET
			opponent_board = excluded.opponent_board,
			seed = excluded.seed,
			status = excluded.status,
			combat_log = excluded.combat_log`,
		runID, day, string(oppJSON), seed, string(logJSON),
	)
	return err
}

// Latest returns the most recent encounter row for a run (highest day),
// or ErrNoEncounter if none exists.
func (s *EncounterStore) Latest(ctx context.Context, runID int64) (*PersistedEncounter, error) {
	var (
		id        int64
		day       int
		oppRaw    string
		seed      int64
		status    string
		logRaw    sql.NullString
	)
	err := s.db.QueryRowContext(ctx, `
		SELECT id, day, opponent_board, seed, status, combat_log
		FROM encounters
		WHERE run_id = ?
		ORDER BY day DESC
		LIMIT 1`, runID,
	).Scan(&id, &day, &oppRaw, &seed, &status, &logRaw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoEncounter
	}
	if err != nil {
		return nil, err
	}
	var opp opponentJSON
	if err := json.Unmarshal([]byte(oppRaw), &opp); err != nil {
		return nil, err
	}
	out := &PersistedEncounter{
		ID:            id,
		RunID:         runID,
		Day:           day,
		OpponentHP:    opp.HP,
		OpponentBoard: opp.Items,
		Seed:          seed,
		Status:        model.EncounterStatus(status),
	}
	if logRaw.Valid && logRaw.String != "" {
		var res model.CombatResult
		if err := json.Unmarshal([]byte(logRaw.String), &res); err != nil {
			return nil, err
		}
		out.Result = &res
	}
	return out, nil
}
