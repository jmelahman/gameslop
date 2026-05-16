package combat

import (
	"testing"

	"github.com/jmelahman/gameslop/internal/model"
)

// fakeCatalog is a minimal Catalog impl backed by a map literal.
type fakeCatalog map[string]model.ItemDef

func (f fakeCatalog) Item(id string) (model.ItemDef, bool) {
	d, ok := f[id]
	return d, ok
}

func newSword(id string, dmg int) model.ItemDef {
	return model.ItemDef{
		ID:   id,
		Name: id,
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: 1000,
				Effects:    []model.Effect{{Op: "damage", Target: "opponent_random", Value: dmg}},
			},
		},
	}
}

func TestSimulate_PlayerWinsWithSingleSword(t *testing.T) {
	cat := fakeCatalog{
		"sword": newSword("sword", 10),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		nil,
		20, 5, 0, cat,
	)
	if res.Outcome != model.CombatOutcomeWin {
		t.Fatalf("expected win, got %q", res.Outcome)
	}
	if res.OpponentEndHP > 0 {
		t.Fatalf("expected opponent dead, got HP=%d", res.OpponentEndHP)
	}
	if res.PlayerEndHP != 20 {
		t.Fatalf("expected player HP unchanged, got %d", res.PlayerEndHP)
	}
	// fight_start, item_fired, damage, fight_end
	if got := len(res.Ticks); got != 4 {
		t.Fatalf("expected 4 events, got %d", got)
	}
}

func TestSimulate_PlayerLoses(t *testing.T) {
	cat := fakeCatalog{
		"sword": newSword("sword", 10),
	}
	res := Simulate(
		nil,
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		5, 20, 0, cat,
	)
	if res.Outcome != model.CombatOutcomeLoss {
		t.Fatalf("expected loss, got %q", res.Outcome)
	}
	if res.PlayerEndHP > 0 {
		t.Fatalf("expected player dead, got HP=%d", res.PlayerEndHP)
	}
}

func TestSimulate_NoDamageIsTie(t *testing.T) {
	cat := fakeCatalog{}
	res := Simulate(nil, nil, 10, 10, 0, cat)
	if res.Outcome != model.CombatOutcomeTie {
		t.Fatalf("expected tie, got %q", res.Outcome)
	}
}

func TestSimulate_DeterministicSameInputs(t *testing.T) {
	cat := fakeCatalog{"a": newSword("a", 3), "b": newSword("b", 4)}
	player := []model.BoardItem{{ItemID: "a", Slot: 0}, {ItemID: "b", Slot: 1}}
	opp := []model.BoardItem{{ItemID: "a", Slot: 0}}
	r1 := Simulate(player, opp, 30, 30, 42, cat)
	r2 := Simulate(player, opp, 30, 30, 42, cat)
	if len(r1.Ticks) != len(r2.Ticks) {
		t.Fatalf("non-deterministic: %d vs %d ticks", len(r1.Ticks), len(r2.Ticks))
	}
	for i, ev := range r1.Ticks {
		if ev != r2.Ticks[i] {
			t.Fatalf("event %d differs: %+v vs %+v", i, ev, r2.Ticks[i])
		}
	}
}
