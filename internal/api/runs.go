package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jmelahman/gameslop/internal/store"
)

type runHandler struct {
	deps Deps
}

type createRunRequest struct {
	HeroID string `json:"hero_id"`
}

func (h *runHandler) create(w http.ResponseWriter, r *http.Request) {
	var req createRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "invalid JSON body")
		return
	}
	if req.HeroID == "" {
		writeError(w, http.StatusBadRequest, "missing_hero", "hero_id is required")
		return
	}
	if _, ok := h.deps.Catalog.Heroes[req.HeroID]; !ok {
		writeError(w, http.StatusBadRequest, "unknown_hero", "unknown hero_id")
		return
	}

	run, err := h.deps.Runs.Create(r.Context(), store.DefaultPlayerID, req.HeroID)
	switch {
	case errors.Is(err, store.ErrActiveRunExists):
		writeError(w, http.StatusConflict, "active_run_exists", "an active run is already in progress")
		return
	case errors.Is(err, store.ErrUnknownHero):
		writeError(w, http.StatusBadRequest, "unknown_hero", "unknown hero_id")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, run)
}

func (h *runHandler) active(w http.ResponseWriter, r *http.Request) {
	run, err := h.deps.Runs.Active(r.Context(), store.DefaultPlayerID)
	switch {
	case errors.Is(err, store.ErrNoActiveRun):
		writeError(w, http.StatusNotFound, "no_active_run", "no active run")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h *runHandler) abandon(w http.ResponseWriter, r *http.Request) {
	err := h.deps.Runs.Abandon(r.Context(), store.DefaultPlayerID)
	switch {
	case errors.Is(err, store.ErrNoActiveRun):
		writeError(w, http.StatusNotFound, "no_active_run", "no active run")
		return
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
