// Package shop owns the pure logic for shop rolls, refreshes, and the
// economic mutations (buy / sell / freeze / xp) on a run's RunState. Nothing
// in here touches SQL — it transforms in-memory state and returns errors that
// the API layer maps to HTTP responses.
package shop

import (
	"errors"
	"sort"

	"github.com/jmelahman/gameslop/internal/model"
)

// BoardWidth is the number of unit-cells in a player's combat board.
const BoardWidth = 10

// MaxShopLevel is the highest shop level (caps XP buying).
const MaxShopLevel = 4

// RefreshCost is the gold required for a manual shop refresh.
const RefreshCost = 1

// XPCost is the gold required to buy one XP point.
const XPCost = 4

// XPPerPurchase is the amount of XP added by a single /shop/xp purchase.
const XPPerPurchase = 1

// xpThresholds is the XP required to level up from the index level to the next
// (e.g. xpThresholds[1] = 4 XP needed to go from L1 to L2). Index 0 / max are
// unused / no-op. Phase 9: 4, 7, 10 per the plan.
var xpThresholds = []int{0, 4, 7, 10}

// XPThreshold returns the XP required to level up from `level` to `level+1`,
// or (0, false) if `level` is the cap (no further progression).
func XPThreshold(level int) (int, bool) {
	if level < 1 || level >= MaxShopLevel {
		return 0, false
	}
	return xpThresholds[level], true
}

// Static errors returned by mutation helpers; the api layer maps each to a
// specific HTTP code via errors.Is.
var (
	ErrInsufficientGold = errors.New("insufficient gold")
	ErrInvalidShopIndex = errors.New("invalid shop index")
	ErrEmptyShopSlot    = errors.New("shop slot already empty")
	ErrInvalidHandSlot  = errors.New("invalid hand slot")
	ErrInvalidBoardSlot = errors.New("invalid board slot")
	ErrUnknownItem      = errors.New("unknown item id")
	ErrBoardFull        = errors.New("not enough contiguous board space")
	ErrShopLevelMax     = errors.New("shop already at max level")
	ErrInvalidLocation  = errors.New("location must be 'board' or 'hand'")
)

// Catalog is the read-only item lookup the shop layer needs. The full catalog
// type lives in internal/catalog; this minimal interface keeps shop_test free
// of that dependency.
type Catalog interface {
	Item(id string) (model.ItemDef, bool)
}

// slotConfig maps shop_level → (slots, tier-weights[bronze,silver,gold,diamond]).
var slotConfig = []struct {
	slots   int
	weights [4]int
}{
	{},                                  // level 0 unused
	{slots: 3, weights: [4]int{100, 0, 0, 0}}, // level 1
	{slots: 4, weights: [4]int{60, 40, 0, 0}}, // level 2
	{slots: 4, weights: [4]int{25, 50, 25, 0}}, // level 3
	{slots: 5, weights: [4]int{10, 30, 40, 20}}, // level 4
}

// SlotsFor returns the number of shop slots at the given shop level.
func SlotsFor(level int) int {
	if level < 1 || level >= len(slotConfig) {
		return 0
	}
	return slotConfig[level].slots
}

// Roll produces a fresh shop array for the given level. The optional `keep`
// slice carries frozen entries from the previous roll — entries in `keep`
// land at the same index and are not re-rolled. Catalog is required so we can
// filter eligible items by tier.
//
// The returned slice always has exactly SlotsFor(level) entries. Empty slots
// are represented with ItemID == "" so the wire shape is stable.
func Roll(cat Catalog, seed int64, day, rolls, level int, keep []model.ShopItem) []model.ShopItem {
	n := SlotsFor(level)
	out := make([]model.ShopItem, n)
	r := newRand(seed, day, rolls)

	// Group catalog items by tier once; sort within tier for determinism.
	byTier := groupByTier(cat)

	weights := slotConfig[level].weights[:]
	tiers := []model.Tier{model.TierBronze, model.TierSilver, model.TierGold, model.TierDiamond}

	for i := 0; i < n; i++ {
		// Frozen items pass through.
		if i < len(keep) && keep[i].Frozen && keep[i].ItemID != "" {
			out[i] = keep[i]
			continue
		}

		// Pick a tier respecting weights; fall back to lower tiers if a chosen
		// tier has no items in catalog yet (early development reality).
		idx := pickWeighted(r, weights)
		var picked model.ItemDef
		ok := false
		for offset := 0; offset < 4 && !ok; offset++ {
			t := tiers[(idx+offset)%4]
			pool := byTier[t]
			if len(pool) == 0 {
				continue
			}
			picked = pool[r.IntN(len(pool))]
			ok = true
		}
		if !ok {
			out[i] = model.ShopItem{}
			continue
		}
		out[i] = model.ShopItem{ItemID: picked.ID, Frozen: false}
	}
	return out
}

func groupByTier(cat Catalog) map[model.Tier][]model.ItemDef {
	// Catalog is small; rebuild every roll. The map is keyed by tier and
	// values are sorted by ID for determinism.
	g := map[model.Tier][]model.ItemDef{}
	// We don't have a direct iterator on the interface — but every caller
	// passes a *catalog.Catalog which has Items. Use a type assertion.
	if it, ok := cat.(catalogLister); ok {
		for _, def := range it.All() {
			g[def.Tier] = append(g[def.Tier], def)
		}
	}
	for k := range g {
		sort.Slice(g[k], func(i, j int) bool { return g[k][i].ID < g[k][j].ID })
	}
	return g
}

// catalogLister is satisfied by *catalog.Catalog; declared here so the shop
// package doesn't need an import cycle on the catalog package.
type catalogLister interface {
	All() []model.ItemDef
}

// Buy moves the shop entry at shopIndex onto the bench, deducting BuyCost gold.
func Buy(state *model.RunState, cat Catalog, shopIndex int) error {
	if shopIndex < 0 || shopIndex >= len(state.Shop) {
		return ErrInvalidShopIndex
	}
	entry := state.Shop[shopIndex]
	if entry.ItemID == "" {
		return ErrEmptyShopSlot
	}
	def, ok := cat.Item(entry.ItemID)
	if !ok {
		return ErrUnknownItem
	}
	if state.Gold < def.BuyCost {
		return ErrInsufficientGold
	}
	state.Gold -= def.BuyCost
	state.Shop[shopIndex] = model.ShopItem{} // mark empty, never re-rolls
	state.Hand = append(state.Hand, model.BoardItem{ItemID: def.ID, Slot: len(state.Hand)})
	return nil
}

// Refresh rerolls non-frozen shop entries, paying RefreshCost.
func Refresh(state *model.RunState, cat Catalog, seed int64) error {
	if state.Gold < RefreshCost {
		return ErrInsufficientGold
	}
	state.Gold -= RefreshCost
	state.ShopRolls++
	state.Shop = Roll(cat, seed, state.Day, state.ShopRolls, state.ShopLevel, state.Shop)
	return nil
}

// Freeze toggles the freeze flag on a shop slot.
func Freeze(state *model.RunState, shopIndex int, frozen bool) error {
	if shopIndex < 0 || shopIndex >= len(state.Shop) {
		return ErrInvalidShopIndex
	}
	if state.Shop[shopIndex].ItemID == "" {
		return ErrEmptyShopSlot
	}
	state.Shop[shopIndex].Frozen = frozen
	return nil
}

// BuyXP pays XPCost gold to add one XP. When XP reaches the level-up threshold
// the shop level is incremented (XP carried over above the threshold) and the
// shop is re-rolled at the new level so the larger slot count and tier odds
// are visible immediately. Frozen items survive a level-up roll.
func BuyXP(state *model.RunState, cat Catalog, seed int64) error {
	if state.ShopLevel >= MaxShopLevel {
		return ErrShopLevelMax
	}
	if state.Gold < XPCost {
		return ErrInsufficientGold
	}
	state.Gold -= XPCost
	state.XP += XPPerPurchase

	leveled := false
	for {
		need, ok := XPThreshold(state.ShopLevel)
		if !ok || state.XP < need {
			break
		}
		state.XP -= need
		state.ShopLevel++
		leveled = true
	}
	if leveled {
		state.ShopRolls++
		state.Shop = Roll(cat, seed, state.Day, state.ShopRolls, state.ShopLevel, state.Shop)
	}
	return nil
}

// PlaceOnBoard moves a bench item onto the board at boardSlot (the leftmost
// cell). If boardSlot < 0 the first free contiguous range is chosen.
func PlaceOnBoard(state *model.RunState, cat Catalog, handSlot, boardSlot int) error {
	if handSlot < 0 || handSlot >= len(state.Hand) {
		return ErrInvalidHandSlot
	}
	def, ok := cat.Item(state.Hand[handSlot].ItemID)
	if !ok {
		return ErrUnknownItem
	}
	size := def.Size
	if size < 1 {
		size = 1
	}

	if boardSlot < 0 {
		slot, ok := firstFreeBoardSlot(state.Board, cat, size)
		if !ok {
			return ErrBoardFull
		}
		boardSlot = slot
	} else {
		if boardSlot > BoardWidth-size {
			return ErrInvalidBoardSlot
		}
		if !boardRangeFree(state.Board, cat, boardSlot, size) {
			return ErrBoardFull
		}
	}

	moved := state.Hand[handSlot]
	moved.Slot = boardSlot
	state.Hand = removeAt(state.Hand, handSlot)
	state.Hand = compactHand(state.Hand)
	state.Board = append(state.Board, moved)
	sortBoard(state.Board)
	return nil
}

// MoveOnBoard re-anchors an item already on the board to a new leftmost slot.
// The target range [toSlot, toSlot+size) must be empty when ignoring the
// item being moved. Returns ErrInvalidBoardSlot if the source is missing or
// the target is out of range, and ErrBoardFull if the target overlaps another
// item.
func MoveOnBoard(state *model.RunState, cat Catalog, fromSlot, toSlot int) error {
	idx := findBoardIndex(state.Board, fromSlot)
	if idx < 0 {
		return ErrInvalidBoardSlot
	}
	def, ok := cat.Item(state.Board[idx].ItemID)
	if !ok {
		return ErrUnknownItem
	}
	size := def.Size
	if size < 1 {
		size = 1
	}
	if toSlot < 0 || toSlot > BoardWidth-size {
		return ErrInvalidBoardSlot
	}
	if toSlot == fromSlot {
		return nil
	}
	// Check collisions while ignoring the moving item itself.
	moving := state.Board[idx]
	rest := make([]model.BoardItem, 0, len(state.Board)-1)
	rest = append(rest, state.Board[:idx]...)
	rest = append(rest, state.Board[idx+1:]...)
	if !boardRangeFree(rest, cat, toSlot, size) {
		return ErrBoardFull
	}
	moving.Slot = toSlot
	state.Board = append(rest, moving)
	sortBoard(state.Board)
	return nil
}

// RemoveFromBoard moves a board item back to the bench.
func RemoveFromBoard(state *model.RunState, boardSlot int) error {
	idx := findBoardIndex(state.Board, boardSlot)
	if idx < 0 {
		return ErrInvalidBoardSlot
	}
	moved := state.Board[idx]
	moved.Slot = len(state.Hand)
	state.Board = append(state.Board[:idx], state.Board[idx+1:]...)
	state.Hand = append(state.Hand, moved)
	return nil
}

// Sell removes the item at the given location/slot, refunding SellValue gold.
// location must be "board" or "hand".
func Sell(state *model.RunState, cat Catalog, location string, slot int) error {
	switch location {
	case "board":
		idx := findBoardIndex(state.Board, slot)
		if idx < 0 {
			return ErrInvalidBoardSlot
		}
		def, ok := cat.Item(state.Board[idx].ItemID)
		if !ok {
			return ErrUnknownItem
		}
		state.Board = append(state.Board[:idx], state.Board[idx+1:]...)
		state.Gold += def.SellValue
		return nil
	case "hand":
		if slot < 0 || slot >= len(state.Hand) {
			return ErrInvalidHandSlot
		}
		def, ok := cat.Item(state.Hand[slot].ItemID)
		if !ok {
			return ErrUnknownItem
		}
		state.Hand = removeAt(state.Hand, slot)
		state.Hand = compactHand(state.Hand)
		state.Gold += def.SellValue
		return nil
	default:
		return ErrInvalidLocation
	}
}

// firstFreeBoardSlot returns the leftmost slot index s such that cells
// [s, s+size) are unoccupied. Returns (0, false) if no such range exists.
func firstFreeBoardSlot(board []model.BoardItem, cat Catalog, size int) (int, bool) {
	for s := 0; s+size <= BoardWidth; s++ {
		if boardRangeFree(board, cat, s, size) {
			return s, true
		}
	}
	return 0, false
}

func boardRangeFree(board []model.BoardItem, cat Catalog, start, size int) bool {
	for _, it := range board {
		def, ok := cat.Item(it.ItemID)
		if !ok {
			continue
		}
		w := def.Size
		if w < 1 {
			w = 1
		}
		if it.Slot+w <= start {
			continue
		}
		if it.Slot >= start+size {
			continue
		}
		return false
	}
	return true
}

func findBoardIndex(board []model.BoardItem, slot int) int {
	for i, it := range board {
		if it.Slot == slot {
			return i
		}
	}
	return -1
}

func removeAt(s []model.BoardItem, i int) []model.BoardItem {
	return append(s[:i], s[i+1:]...)
}

func compactHand(hand []model.BoardItem) []model.BoardItem {
	for i := range hand {
		hand[i].Slot = i
	}
	return hand
}

func sortBoard(board []model.BoardItem) {
	sort.Slice(board, func(i, j int) bool { return board[i].Slot < board[j].Slot })
}
