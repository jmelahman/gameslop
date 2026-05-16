package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jmelahman/gameslop/internal/catalog"
	"github.com/jmelahman/gameslop/internal/model"
	"github.com/jmelahman/gameslop/internal/shop"
)

// ErrActiveRunExists is returned by Create when the player already has an
// active run.
var ErrActiveRunExists = errors.New("active run already exists")

// ErrNoActiveRun is returned when no active run is found for the player.
var ErrNoActiveRun = errors.New("no active run")

// ErrUnknownHero is returned when the requested hero_id isn't in the catalog.
var ErrUnknownHero = errors.New("unknown hero")

// RunStore wraps SQL access for runs + run_state.
type RunStore struct {
	db  *sql.DB
	cat *catalog.Catalog
}

// NewRunStore wraps db. Catalog is used to seed the initial shop on Create.
func NewRunStore(db *sql.DB, cat *catalog.Catalog) *RunStore {
	return &RunStore{db: db, cat: cat}
}

// Create starts a new run for the player using the given hero. Fails with
// ErrActiveRunExists if one is already in progress.
func (s *RunStore) Create(ctx context.Context, playerID int64, heroID string) (*model.ActiveRun, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var existing int64
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM runs WHERE player_id = ? AND status = 'active' LIMIT 1`,
		playerID,
	).Scan(&existing)
	if err == nil {
		return nil, ErrActiveRunExists
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	var startingHP int
	err = tx.QueryRowContext(ctx,
		`SELECT starting_hp FROM hero_catalog WHERE id = ?`, heroID,
	).Scan(&startingHP)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnknownHero
	}
	if err != nil {
		return nil, err
	}

	seed, err := randSeed()
	if err != nil {
		return nil, err
	}
	now := time.Now().Unix()

	res, err := tx.ExecContext(ctx,
		`INSERT INTO runs (player_id, hero_id, status, shop_seed, started_at)
		 VALUES (?, ?, 'active', ?, ?)`,
		playerID, heroID, seed, now,
	)
	if err != nil {
		return nil, err
	}
	runID, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	state := model.RunState{
		RunID:     runID,
		Day:       1,
		Gold:      10,
		HP:        startingHP,
		ShopLevel: 1,
		XP:        0,
		ShopRolls: 0,
		Hand:      []model.BoardItem{},
		Board:     []model.BoardItem{},
		UpdatedAt: now,
	}
	state.Shop = shop.Roll(s.cat, seed, state.Day, state.ShopRolls, state.ShopLevel, nil)
	shopJSON, _ := json.Marshal(state.Shop)
	handJSON, _ := json.Marshal(state.Hand)
	boardJSON, _ := json.Marshal(state.Board)

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO run_state
			(run_id, day, gold, hp, shop_level, xp, shop_rolls, shop_json, hand_json, board_json, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		state.RunID, state.Day, state.Gold, state.HP, state.ShopLevel, state.XP, state.ShopRolls,
		string(shopJSON), string(handJSON), string(boardJSON), state.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &model.ActiveRun{
		Run: model.Run{
			ID:        runID,
			PlayerID:  playerID,
			HeroID:    heroID,
			Status:    model.RunStatusActive,
			ShopSeed:  seed,
			StartedAt: now,
		},
		State: state,
	}, nil
}

// Active returns the player's currently active run + state, or ErrNoActiveRun.
func (s *RunStore) Active(ctx context.Context, playerID int64) (*model.ActiveRun, error) {
	run := model.Run{}
	var endedAt sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT id, player_id, hero_id, status, shop_seed, started_at, ended_at
		FROM runs WHERE player_id = ? AND status = 'active' LIMIT 1`, playerID,
	).Scan(&run.ID, &run.PlayerID, &run.HeroID, &run.Status, &run.ShopSeed, &run.StartedAt, &endedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoActiveRun
	}
	if err != nil {
		return nil, err
	}
	if endedAt.Valid {
		v := endedAt.Int64
		run.EndedAt = &v
	}

	state := model.RunState{}
	var shopJSON, handJSON, boardJSON string
	err = s.db.QueryRowContext(ctx, `
		SELECT run_id, day, gold, hp, shop_level, xp, shop_rolls, shop_json, hand_json, board_json, updated_at
		FROM run_state WHERE run_id = ?`, run.ID,
	).Scan(&state.RunID, &state.Day, &state.Gold, &state.HP, &state.ShopLevel, &state.XP, &state.ShopRolls,
		&shopJSON, &handJSON, &boardJSON, &state.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("load run_state for run %d: %w", run.ID, err)
	}
	if err := json.Unmarshal([]byte(shopJSON), &state.Shop); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(handJSON), &state.Hand); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(boardJSON), &state.Board); err != nil {
		return nil, err
	}

	return &model.ActiveRun{Run: run, State: state}, nil
}

// UpdateState persists the mutable run_state row, refreshing updated_at.
// Returns ErrNoActiveRun if no row exists for the given run_id.
func (s *RunStore) UpdateState(ctx context.Context, state *model.RunState) error {
	state.UpdatedAt = time.Now().Unix()
	shopJSON, err := json.Marshal(state.Shop)
	if err != nil {
		return err
	}
	handJSON, err := json.Marshal(state.Hand)
	if err != nil {
		return err
	}
	boardJSON, err := json.Marshal(state.Board)
	if err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, `
		UPDATE run_state SET
			day = ?, gold = ?, hp = ?, shop_level = ?, xp = ?, shop_rolls = ?,
			shop_json = ?, hand_json = ?, board_json = ?, updated_at = ?
		WHERE run_id = ?`,
		state.Day, state.Gold, state.HP, state.ShopLevel, state.XP, state.ShopRolls,
		string(shopJSON), string(handJSON), string(boardJSON), state.UpdatedAt,
		state.RunID,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNoActiveRun
	}
	return nil
}

// Abandon marks the player's active run as abandoned. Returns ErrNoActiveRun
// if there isn't one.
func (s *RunStore) Abandon(ctx context.Context, playerID int64) error {
	now := time.Now().Unix()
	res, err := s.db.ExecContext(ctx, `
		UPDATE runs SET status = 'abandoned', ended_at = ?
		WHERE player_id = ? AND status = 'active'`, now, playerID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNoActiveRun
	}
	return nil
}

func randSeed() (int64, error) {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return 0, err
	}
	return int64(binary.LittleEndian.Uint64(buf[:])), nil
}
