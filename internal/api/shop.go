package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jmelahman/gameslop/internal/shop"
	"github.com/jmelahman/gameslop/internal/store"
)

// shopHandler holds the routes that mutate the run's shop / hand / board.
// It always writes the full ActiveRun on success so the client can replace
// its cached state in one operation.
type shopHandler struct {
	deps Deps
}

// loadActive fetches the player's current active run; returns ok=false and
// writes the error envelope when there is no run or the read fails.
func (h *shopHandler) loadActive(w http.ResponseWriter, r *http.Request) (*runAndState, bool) {
	active, err := h.deps.Runs.Active(r.Context(), store.DefaultPlayerID)
	switch {
	case errors.Is(err, store.ErrNoActiveRun):
		writeError(w, http.StatusNotFound, "no_active_run", "no active run")
		return nil, false
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return nil, false
	}
	return &runAndState{ActiveRun: *active}, true
}

func (h *shopHandler) persistAndWrite(w http.ResponseWriter, r *http.Request, ra *runAndState) {
	if err := h.deps.Runs.UpdateState(r.Context(), &ra.State); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ra.ActiveRun)
}

type buyRequest struct {
	ShopIndex int `json:"shop_index"`
}

func (h *shopHandler) buy(w http.ResponseWriter, r *http.Request) {
	var req buyRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	if err := shop.Buy(&ra.State, h.deps.Catalog, req.ShopIndex); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}

func (h *shopHandler) refresh(w http.ResponseWriter, r *http.Request) {
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	if err := shop.Refresh(&ra.State, h.deps.Catalog, ra.Run.ShopSeed); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}

type freezeRequest struct {
	ShopIndex int  `json:"shop_index"`
	Frozen    bool `json:"frozen"`
}

func (h *shopHandler) freeze(w http.ResponseWriter, r *http.Request) {
	var req freezeRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	if err := shop.Freeze(&ra.State, req.ShopIndex, req.Frozen); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}

func (h *shopHandler) xp(w http.ResponseWriter, r *http.Request) {
	ra, ok := h.loadActive(w, r)
	if !ok {
		return
	}
	if err := shop.BuyXP(&ra.State, h.deps.Catalog, ra.Run.ShopSeed); err != nil {
		writeShopError(w, err)
		return
	}
	h.persistAndWrite(w, r, ra)
}

// catalogItems exposes the static item catalog. Read-only.
func (h *shopHandler) catalogItems(w http.ResponseWriter, r *http.Request) {
	items := h.deps.Catalog.All()
	type wireItem struct {
		ID        string   `json:"id"`
		Name      string   `json:"name"`
		Tier      string   `json:"tier"`
		Size      int      `json:"size"`
		Tags      []string `json:"tags"`
		BuyCost   int      `json:"buy_cost"`
		SellValue int      `json:"sell_value"`
	}
	out := make([]wireItem, 0, len(items))
	for _, it := range items {
		tags := it.Tags
		if tags == nil {
			tags = []string{}
		}
		out = append(out, wireItem{
			ID:        it.ID,
			Name:      it.Name,
			Tier:      string(it.Tier),
			Size:      it.Size,
			Tags:      tags,
			BuyCost:   it.BuyCost,
			SellValue: it.SellValue,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

// catalogEnchantments exposes the static enchantment catalog. Read-only.
func (h *shopHandler) catalogEnchantments(w http.ResponseWriter, r *http.Request) {
	enchs := h.deps.Catalog.AllEnchantments()
	type wireEnch struct {
		ID          string   `json:"id"`
		Name        string   `json:"name"`
		Description string   `json:"description"`
		AppliesTo   []string `json:"applies_to"`
	}
	out := make([]wireEnch, 0, len(enchs))
	for _, e := range enchs {
		applies := e.AppliesTo
		if applies == nil {
			applies = []string{}
		}
		out = append(out, wireEnch{
			ID: e.ID, Name: e.Name, Description: e.Description, AppliesTo: applies,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func writeShopError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, shop.ErrInsufficientGold):
		writeError(w, http.StatusBadRequest, "insufficient_gold", err.Error())
	case errors.Is(err, shop.ErrInvalidShopIndex),
		errors.Is(err, shop.ErrEmptyShopSlot),
		errors.Is(err, shop.ErrInvalidHandSlot),
		errors.Is(err, shop.ErrInvalidBoardSlot),
		errors.Is(err, shop.ErrInvalidLocation):
		writeError(w, http.StatusBadRequest, "invalid_target", err.Error())
	case errors.Is(err, shop.ErrUnknownItem):
		writeError(w, http.StatusBadRequest, "unknown_item", err.Error())
	case errors.Is(err, shop.ErrBoardFull):
		writeError(w, http.StatusBadRequest, "board_full", err.Error())
	case errors.Is(err, shop.ErrShopLevelMax):
		writeError(w, http.StatusBadRequest, "shop_level_max", err.Error())
	case errors.Is(err, shop.ErrUnknownEnchantment):
		writeError(w, http.StatusBadRequest, "unknown_enchantment", err.Error())
	case errors.Is(err, shop.ErrItemNotEnchantable):
		writeError(w, http.StatusBadRequest, "not_enchantable", err.Error())
	case errors.Is(err, shop.ErrEnchantmentSlotFull):
		writeError(w, http.StatusBadRequest, "enchantment_slot_full", err.Error())
	case errors.Is(err, shop.ErrEnchantmentTagMatch):
		writeError(w, http.StatusBadRequest, "enchantment_tag_mismatch", err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "internal", err.Error())
	}
}

func decodeBody(r *http.Request, dst any) error {
	if r.Body == nil || r.ContentLength == 0 {
		return nil
	}
	return json.NewDecoder(r.Body).Decode(dst)
}
