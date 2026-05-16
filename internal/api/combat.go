package api

import (
	"errors"
	"net/http"

	"github.com/jmelahman/gameslop/internal/combat"
	"github.com/jmelahman/gameslop/internal/encounter"
	"github.com/jmelahman/gameslop/internal/model"
	"github.com/jmelahman/gameslop/internal/shop"
	"github.com/jmelahman/gameslop/internal/store"
)

// MaxDay is the final day in a run; surviving day MaxDay with a non-loss
// outcome wins the run.
const MaxDay = 10

// combatHandler owns the /api/runs/active/combat/* routes.
type combatHandler struct {
	deps Deps
}

// combatStartResponse is the wire envelope for both the start mutation and
// the GET-back-the-last-result endpoint. Run is nil when the start call
// terminated the run (loss or final-day win).
type combatStartResponse struct {
	Result        *model.CombatResult `json:"result"`
	Run           *model.ActiveRun    `json:"run,omitempty"`
	PlayerBoard   []model.BoardItem   `json:"player_board"`
	OpponentBoard []model.BoardItem   `json:"opponent_board"`
	OpponentHP    int                 `json:"opponent_hp"`
	Day           int                 `json:"day"`
	Ended         bool                `json:"ended"`
	FinalOutcome  model.RunStatus     `json:"final_outcome,omitempty"`
}

// combatSeed mixes the run's shop_seed with run_id and day to give Simulate a
// reproducible per-fight seed without colliding with shop or encounter seeds.
// Matches the plan's formula: shop_seed XOR (run_id * 0x517cc1b727220a95) XOR day.
func combatSeed(shopSeed, runID int64, day int) int64 {
	const mixA uint64 = 0x517cc1b727220a95
	return int64(uint64(shopSeed) ^ (uint64(runID) * mixA) ^ uint64(day))
}

// encounterSeed mixes shop_seed with day so opponent generation is stable
// per run+day.
func encounterSeed(shopSeed int64, day int) int64 {
	const mixD uint64 = 0x6b43a9b5
	return int64(uint64(shopSeed) ^ (uint64(day) * mixD))
}

// start runs the day's combat: generates the opponent, simulates, persists
// the encounter, then advances or ends the run based on the outcome.
func (h *combatHandler) start(w http.ResponseWriter, r *http.Request) {
	active, err := h.deps.Runs.Active(r.Context(), store.DefaultPlayerID)
	switch {
	case errors.Is(err, store.ErrNoActiveRun):
		writeError(w, http.StatusNotFound, "no_active_run", "no active run")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	day := active.State.Day
	opp := encounter.Generate(day, encounterSeed(active.Run.ShopSeed, day))

	// Snapshot the player's board up-front so it travels with both the
	// in-memory response and the persisted combat log, surviving end-of-run.
	playerBoard := make([]model.BoardItem, len(active.State.Board))
	copy(playerBoard, active.State.Board)

	result := combat.Simulate(
		playerBoard,
		opp.Items,
		active.State.HP,
		opp.HP,
		combatSeed(active.Run.ShopSeed, active.Run.ID, day),
		h.deps.Catalog,
	)
	result.PlayerBoard = playerBoard
	result.OpponentBoard = opp.Items

	if err := h.deps.Encounters.Resolve(
		r.Context(), active.Run.ID, day, opp.HP, opp.Items,
		combatSeed(active.Run.ShopSeed, active.Run.ID, day), result,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}

	resp := combatStartResponse{
		Result:        result,
		PlayerBoard:   playerBoard,
		OpponentBoard: opp.Items,
		OpponentHP:    opp.HP,
		Day:           day,
	}

	// Update run state HP from sim result, clamped at 0. Ties don't cost run
	// HP per the plan ("advance day, no reward, no HP cost"), so we only
	// write back on win/loss.
	newHP := result.PlayerEndHP
	if newHP < 0 {
		newHP = 0
	}
	if result.Outcome != model.CombatOutcomeTie {
		active.State.HP = newHP
	}

	switch {
	case result.Outcome == model.CombatOutcomeLoss:
		if err := h.deps.Runs.Finish(r.Context(), active.Run.ID, model.RunStatusLost); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		resp.Ended = true
		resp.FinalOutcome = model.RunStatusLost
		writeJSON(w, http.StatusOK, resp)
		return

	default:
		// Win or tie: advance day. If that pushes past MaxDay the run is won.
		active.State.Day++
		if day >= MaxDay {
			if err := h.deps.Runs.Finish(r.Context(), active.Run.ID, model.RunStatusWon); err != nil {
				writeError(w, http.StatusInternalServerError, "internal", err.Error())
				return
			}
			resp.Ended = true
			resp.FinalOutcome = model.RunStatusWon
			writeJSON(w, http.StatusOK, resp)
			return
		}
		// Continuing: refresh shop for the new day, top up gold, persist.
		gold := 3 + active.State.Day
		if gold > 10 {
			gold = 10
		}
		if result.Outcome == model.CombatOutcomeWin {
			gold += 2
		}
		active.State.Gold += gold
		active.State.ShopRolls = 0
		active.State.Shop = shop.Roll(
			h.deps.Catalog, active.Run.ShopSeed,
			active.State.Day, active.State.ShopRolls, active.State.ShopLevel, nil,
		)
		if err := h.deps.Runs.UpdateState(r.Context(), &active.State); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", err.Error())
			return
		}
		resp.Run = active
		writeJSON(w, http.StatusOK, resp)
	}
}

// result returns the latest resolved encounter for the active run so the
// client can recover state after a refresh during combat playback.
func (h *combatHandler) result(w http.ResponseWriter, r *http.Request) {
	active, err := h.deps.Runs.Active(r.Context(), store.DefaultPlayerID)
	switch {
	case errors.Is(err, store.ErrNoActiveRun):
		writeError(w, http.StatusNotFound, "no_active_run", "no active run")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	enc, err := h.deps.Encounters.Latest(r.Context(), active.Run.ID)
	switch {
	case errors.Is(err, store.ErrNoEncounter):
		writeError(w, http.StatusNotFound, "no_combat_result", "no combat result yet")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	playerBoard := []model.BoardItem{}
	if enc.Result != nil && len(enc.Result.PlayerBoard) > 0 {
		playerBoard = enc.Result.PlayerBoard
	}
	resp := combatStartResponse{
		Result:        enc.Result,
		Run:           active,
		PlayerBoard:   playerBoard,
		OpponentBoard: enc.OpponentBoard,
		OpponentHP:    enc.OpponentHP,
		Day:           enc.Day,
	}
	writeJSON(w, http.StatusOK, resp)
}
