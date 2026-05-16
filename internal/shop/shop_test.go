package shop

import (
	"testing"

	"github.com/jmelahman/gameslop/internal/model"
)

type fakeCatalog struct {
	items map[string]model.ItemDef
}

func (f *fakeCatalog) Item(id string) (model.ItemDef, bool) {
	d, ok := f.items[id]
	return d, ok
}

func (f *fakeCatalog) All() []model.ItemDef {
	out := make([]model.ItemDef, 0, len(f.items))
	for _, v := range f.items {
		out = append(out, v)
	}
	return out
}

func bronze(id string, size, cost, sell int) model.ItemDef {
	return model.ItemDef{ID: id, Name: id, Tier: model.TierBronze, Size: size, BuyCost: cost, SellValue: sell}
}

func newCat() *fakeCatalog {
	return &fakeCatalog{items: map[string]model.ItemDef{
		"a": bronze("a", 1, 3, 1),
		"b": bronze("b", 2, 4, 2),
		"c": bronze("c", 1, 2, 1),
	}}
}

func TestRollDeterministic(t *testing.T) {
	cat := newCat()
	r1 := Roll(cat, 42, 1, 0, 1, nil)
	r2 := Roll(cat, 42, 1, 0, 1, nil)
	if len(r1) != 3 {
		t.Fatalf("level 1 should have 3 slots, got %d", len(r1))
	}
	for i := range r1 {
		if r1[i] != r2[i] {
			t.Fatalf("same seed produced different roll at slot %d: %v vs %v", i, r1[i], r2[i])
		}
	}
}

func TestRollKeepsFrozen(t *testing.T) {
	cat := newCat()
	first := Roll(cat, 1, 1, 0, 1, nil)
	first[0].Frozen = true
	second := Roll(cat, 1, 1, 1, 1, first)
	if second[0] != first[0] {
		t.Fatalf("expected frozen slot 0 preserved: %v vs %v", first[0], second[0])
	}
}

func TestBuyAndSellRoundTrip(t *testing.T) {
	cat := newCat()
	state := &model.RunState{Gold: 10, ShopLevel: 1, Shop: []model.ShopItem{{ItemID: "a"}}}
	if err := Buy(state, cat, 0); err != nil {
		t.Fatal(err)
	}
	if state.Gold != 7 {
		t.Fatalf("gold should be 7 after 3g buy, got %d", state.Gold)
	}
	if len(state.Hand) != 1 || state.Hand[0].ItemID != "a" {
		t.Fatalf("expected hand=[a], got %+v", state.Hand)
	}
	if state.Shop[0].ItemID != "" {
		t.Fatalf("expected shop slot cleared, got %v", state.Shop[0])
	}
	if err := Sell(state, cat, "hand", 0); err != nil {
		t.Fatal(err)
	}
	if state.Gold != 8 {
		t.Fatalf("gold should be 8 after 1g sell, got %d", state.Gold)
	}
}

func TestBuyInsufficientGold(t *testing.T) {
	cat := newCat()
	state := &model.RunState{Gold: 1, Shop: []model.ShopItem{{ItemID: "a"}}}
	if err := Buy(state, cat, 0); err == nil {
		t.Fatal("expected insufficient_gold error")
	}
}

func TestPlaceOnBoardAutoSlot(t *testing.T) {
	cat := newCat()
	state := &model.RunState{
		Hand: []model.BoardItem{{ItemID: "b", Slot: 0}},
	}
	if err := PlaceOnBoard(state, cat, 0, -1); err != nil {
		t.Fatal(err)
	}
	if len(state.Hand) != 0 {
		t.Fatalf("hand should be empty after place, got %+v", state.Hand)
	}
	if len(state.Board) != 1 || state.Board[0].Slot != 0 || state.Board[0].ItemID != "b" {
		t.Fatalf("expected board=[b@0], got %+v", state.Board)
	}
}

func TestPlaceOnBoardFull(t *testing.T) {
	cat := newCat()
	state := &model.RunState{
		Hand: []model.BoardItem{{ItemID: "a"}},
		Board: []model.BoardItem{
			{ItemID: "a", Slot: 0}, {ItemID: "a", Slot: 1}, {ItemID: "a", Slot: 2},
			{ItemID: "a", Slot: 3}, {ItemID: "a", Slot: 4}, {ItemID: "a", Slot: 5},
			{ItemID: "a", Slot: 6}, {ItemID: "a", Slot: 7}, {ItemID: "a", Slot: 8},
			{ItemID: "a", Slot: 9},
		},
	}
	if err := PlaceOnBoard(state, cat, 0, -1); err == nil {
		t.Fatal("expected board_full error")
	}
}

func TestRefreshDeducts(t *testing.T) {
	cat := newCat()
	state := &model.RunState{Gold: 2, Day: 1, ShopLevel: 1, Shop: Roll(cat, 1, 1, 0, 1, nil)}
	before := state.ShopRolls
	if err := Refresh(state, cat, 1); err != nil {
		t.Fatal(err)
	}
	if state.Gold != 1 {
		t.Fatalf("expected 1g after refresh, got %d", state.Gold)
	}
	if state.ShopRolls != before+1 {
		t.Fatalf("expected ShopRolls incremented, got %d", state.ShopRolls)
	}
}
