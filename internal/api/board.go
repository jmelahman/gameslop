package api

import (
	"net/http"

	"github.com/jmelahman/gameslop/internal/model"
	"github.com/jmelahman/gameslop/internal/shop"
)

// runAndState bundles the loaded active run + a mutable state pointer used
// by every shop / board / sell handler.
type runAndState struct {
	model.ActiveRun
}

type placeRequest struct {
	HandSlot  int  `json:"hand_slot"`
	BoardSlot *int `json:"board_slot,omitempty"`
}

func (h *shopHandler) place(w http.ResponseWriter, r *http.Request) {
	var req placeRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	target := -1
	if req.BoardSlot != nil {
		target = *req.BoardSlot
	}
	if err := shop.PlaceOnBoard(&ra.State, h.deps.Catalog, req.HandSlot, target); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}

type removeRequest struct {
	BoardSlot int `json:"board_slot"`
}

func (h *shopHandler) remove(w http.ResponseWriter, r *http.Request) {
	var req removeRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	if err := shop.RemoveFromBoard(&ra.State, req.BoardSlot); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}

type sellRequest struct {
	Location string `json:"location"`
	Slot     int    `json:"slot"`
}

func (h *shopHandler) sell(w http.ResponseWriter, r *http.Request) {
	var req sellRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	if err := shop.Sell(&ra.State, h.deps.Catalog, req.Location, req.Slot); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}
