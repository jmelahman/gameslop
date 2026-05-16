package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

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

// historyResponse pairs the page of history rows with the total count so the
// /stats page can render paginated controls without a second request.
type historyResponse struct {
	Entries []store.HistoryEntry `json:"entries"`
	Total   int                  `json:"total"`
	Limit   int                  `json:"limit"`
	Offset  int                  `json:"offset"`
}

func (h *runHandler) history(w http.ResponseWriter, r *http.Request) {
	limit := parseIntParam(r, "limit", 20)
	offset := parseIntParam(r, "offset", 0)
	entries, err := h.deps.History.List(r.Context(), store.DefaultPlayerID, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	if entries == nil {
		entries = []store.HistoryEntry{}
	}
	total, err := h.deps.History.Count(r.Context(), store.DefaultPlayerID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, historyResponse{
		Entries: entries,
		Total:   total,
		Limit:   limit,
		Offset:  offset,
	})
}

func (h *runHandler) clearHistory(w http.ResponseWriter, r *http.Request) {
	if _, err := h.deps.History.Clear(r.Context(), store.DefaultPlayerID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseIntParam(r *http.Request, key string, fallback int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
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
