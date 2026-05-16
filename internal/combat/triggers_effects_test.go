package combat

import (
	"strings"
	"testing"

	"github.com/jmelahman/gameslop/internal/model"
)

// TestTriggerEffectMatrix walks every trigger × effect combination that can
// produce a tick event during combat and asserts the engine emits the
// expected event. This is the "table golden" guard that catches regressions
// when adding new items: changing the engine in a way that swallows or
// renames an event for any (trigger, effect) pair fails here.
//
// Some combinations are deliberately excluded:
//
//   - on_sell: not exercised by Simulate(); it fires from the shop
//     handler, not the combat loop. Tested separately by the shop tests.
//   - effects that only emit at runtime via on_kill (gain_gold) appear in
//     the on_kill row, not in every row.
func TestTriggerEffectMatrix(t *testing.T) {
	cases := []struct {
		name        string
		// Build the test board(s). Returns (player, opponent).
		boards func() ([]model.BoardItem, []model.BoardItem)
		// Items registered with the catalog used by Simulate.
		catalog fakeCatalog
		// Starting HP for player/opponent.
		playerHP, opponentHP int
		// Event predicate the engine must emit at least once.
		want func(model.TickEvent) bool
		// Optional minimum total event count for the predicate.
		min int
	}{
		// ───── cooldown × … ─────
		{
			name: "cooldown × damage",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "sword", Slot: 0}}, nil
			},
			catalog:    fakeCatalog{"sword": damager("sword", 500, 4)},
			playerHP:   20,
			opponentHP: 20,
			want: func(e model.TickEvent) bool {
				return e.Type == "damage" && e.Source == "player:sword" && e.Value == 4
			},
			min: 1,
		},
		{
			name: "cooldown × heal",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				// Player takes constant chip damage; potion heals back.
				return []model.BoardItem{{ItemID: "potion", Slot: 0}},
					[]model.BoardItem{{ItemID: "sword", Slot: 0}}
			},
			catalog: fakeCatalog{
				"potion": healer("potion", 200, 3),
				"sword":  damager("sword", 500, 2),
			},
			playerHP:   30,
			opponentHP: 100,
			want: func(e model.TickEvent) bool {
				return e.Type == "heal" && e.Source == "player:potion"
			},
			min: 1,
		},
		{
			name: "cooldown × shield",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "ward", Slot: 0}}, nil
			},
			catalog: fakeCatalog{
				"ward": itemWithCooldown("ward", 300, model.Effect{
					Op: "shield", Target: "self_player", Value: 4,
				}),
			},
			playerHP:   20,
			opponentHP: 20,
			want: func(e model.TickEvent) bool {
				return e.Type == "shield_applied" && e.Target == "player"
			},
			min: 1,
		},
		{
			name: "cooldown × poison",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "vile", Slot: 0}}, nil
			},
			catalog:    fakeCatalog{"vile": poisoner("vile", 500, 2)},
			playerHP:   30,
			opponentHP: 30,
			want: func(e model.TickEvent) bool {
				return e.Type == "status_applied" && strings.Contains(e.Source, "vile")
			},
			min: 1,
		},
		{
			name: "cooldown × burn",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "flame", Slot: 0}}, nil
			},
			catalog:    fakeCatalog{"flame": burner("flame", 500, 2)},
			playerHP:   30,
			opponentHP: 30,
			want: func(e model.TickEvent) bool {
				return e.Type == "status_applied" && strings.Contains(e.Source, "flame")
			},
			min: 1,
		},
		{
			name: "cooldown × freeze",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "froz", Slot: 0}},
					[]model.BoardItem{{ItemID: "victim", Slot: 0}}
			},
			catalog: fakeCatalog{
				"froz": itemWithCooldown("froz", 300, model.Effect{
					Op: "freeze", Target: "opponent_front", DurationMs: 2000,
				}),
				"victim": damager("victim", 500, 1),
			},
			playerHP:   50,
			opponentHP: 50,
			want: func(e model.TickEvent) bool {
				return e.Type == "status_applied" && e.Source == "player:froz"
			},
			min: 1,
		},
		{
			name: "cooldown × haste",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{
					{ItemID: "drum", Slot: 0},
					{ItemID: "sword", Slot: 1},
				}, nil
			},
			catalog: fakeCatalog{
				"drum": itemWithCooldown("drum", 200, model.Effect{
					Op: "haste", Target: "self_adjacent", Value: 100, DurationMs: 400,
				}),
				"sword": damager("sword", 1000, 1),
			},
			playerHP:   30,
			opponentHP: 200,
			// Drum's haste fires an event; it shouldn't produce a status_applied
			// (haste is a buff modifier, not a debuff), but a "modifier_applied"
			// event is acceptable. The minimum claim is that drum at least fires.
			want: func(e model.TickEvent) bool {
				return e.Type == "item_fired" && e.Source == "player:drum"
			},
			min: 1,
		},
		{
			name: "cooldown × gain_gold",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "coin", Slot: 0}}, nil
			},
			catalog: fakeCatalog{
				"coin": itemWithCooldown("coin", 200, model.Effect{
					Op: "gain_gold", Target: "self_player", Value: 1,
				}),
			},
			playerHP:   30,
			opponentHP: 30,
			want: func(e model.TickEvent) bool {
				return e.Type == "gain_gold" && e.Source == "player:coin"
			},
			min: 1,
		},
		{
			name: "cooldown × draw_item",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "satchel", Slot: 0}}, nil
			},
			catalog: fakeCatalog{
				"satchel": itemWithCooldown("satchel", 200, model.Effect{
					Op: "draw_item", Target: "self_player", Value: 1,
				}),
			},
			playerHP:   30,
			opponentHP: 30,
			want: func(e model.TickEvent) bool {
				return e.Type == "draw_item" && e.Source == "player:satchel"
			},
			min: 1,
		},
		{
			name: "cooldown × buff",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{
					{ItemID: "horn", Slot: 0},
					{ItemID: "sword", Slot: 1},
				}, nil
			},
			catalog: fakeCatalog{
				"horn": itemWithCooldown("horn", 200, model.Effect{
					Op: "buff", Target: "self_all_weapons", Value: 1,
				}),
				"sword": taggedDamager("sword", 1000, 1, "Weapon"),
			},
			playerHP:   30,
			opponentHP: 200,
			want: func(e model.TickEvent) bool {
				return e.Type == "item_fired" && e.Source == "player:horn"
			},
			min: 1,
		},

		// ───── at_fight_start × … ─────
		{
			name: "at_fight_start × damage",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "thunder", Slot: 0}},
					[]model.BoardItem{{ItemID: "victim", Slot: 0}}
			},
			catalog: fakeCatalog{
				"thunder": atFightStart("thunder", model.Effect{
					Op: "damage", Target: "opponent_random", Value: 7,
				}),
				"victim": damager("victim", 9999, 1),
			},
			playerHP:   30,
			opponentHP: 30,
			want: func(e model.TickEvent) bool {
				return e.Type == "damage" && e.Tick == 0 && e.Source == "player:thunder"
			},
			min: 1,
		},
		{
			name: "at_fight_start × shield",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "barrier", Slot: 0}}, nil
			},
			catalog: fakeCatalog{"barrier": shielder("barrier", 8)},
			playerHP:   30,
			opponentHP: 30,
			want: func(e model.TickEvent) bool {
				return e.Type == "shield_applied" && e.Tick == 0 && e.Value == 8
			},
			min: 1,
		},
		{
			name: "at_fight_start × buff",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{
					{ItemID: "banner", Slot: 0},
					{ItemID: "sword", Slot: 1},
				}, nil
			},
			catalog: fakeCatalog{
				"banner": atFightStart("banner", model.Effect{
					Op: "buff", Target: "self_all_weapons", Value: 3,
				}),
				"sword": taggedDamager("sword", 500, 2, "Weapon"),
			},
			playerHP:   30,
			opponentHP: 200,
			// First sword hit gets +3 from the at_fight_start buff.
			want: func(e model.TickEvent) bool {
				return e.Type == "damage" && e.Source == "player:sword" && e.Value == 5
			},
			min: 1,
		},

		// ───── on_take_damage × … ─────
		{
			name: "on_take_damage × heal",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "phoenix", Slot: 0}},
					[]model.BoardItem{{ItemID: "sword", Slot: 0}}
			},
			catalog: fakeCatalog{
				"phoenix": onTakeDamage("phoenix", model.Effect{
					Op: "heal", Target: "self_player", Value: 3,
				}),
				"sword": damager("sword", 500, 2),
			},
			playerHP:   30,
			opponentHP: 50,
			want: func(e model.TickEvent) bool {
				return e.Type == "heal" && e.Source == "player:phoenix"
			},
			min: 1,
		},

		// ───── when_adjacent_fires × … ─────
		{
			name: "when_adjacent_fires × damage",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{
					{ItemID: "rod", Slot: 0},
					{ItemID: "sword", Slot: 1},
				}, nil
			},
			catalog: fakeCatalog{
				"rod": whenAdjacentFires("rod", model.Effect{
					Op: "damage", Target: "opponent_random", Value: 1,
				}),
				"sword": damager("sword", 500, 1),
			},
			playerHP:   30,
			opponentHP: 200,
			want: func(e model.TickEvent) bool {
				return e.Type == "damage" && e.Source == "player:rod"
			},
			min: 1,
		},

		// ───── on_kill × … ─────
		{
			name: "on_kill × gain_gold",
			boards: func() ([]model.BoardItem, []model.BoardItem) {
				return []model.BoardItem{{ItemID: "vamp", Slot: 0}}, nil
			},
			catalog: fakeCatalog{
				"vamp": withTriggers("vamp",
					model.Trigger{
						Type: "cooldown", CooldownMs: 300,
						Effects: []model.Effect{{Op: "damage", Target: "opponent_random", Value: 50}},
					},
					model.Trigger{
						Type:    "on_kill",
						Effects: []model.Effect{{Op: "gain_gold", Target: "self_player", Value: 4}},
					},
				),
			},
			playerHP:   30,
			opponentHP: 5,
			want: func(e model.TickEvent) bool {
				return e.Type == "gain_gold" && e.Value == 4
			},
			min: 1,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			player, opp := tc.boards()
			res := Simulate(player, opp, tc.playerHP, tc.opponentHP, 0, tc.catalog)
			matched := 0
			for _, e := range res.Ticks {
				if tc.want(e) {
					matched++
				}
			}
			if matched < tc.min {
				t.Fatalf("expected ≥%d matching event(s); got %d\nlog: %s",
					tc.min, matched, dumpTicks(res.Ticks))
			}
		})
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

func itemWithCooldown(id string, cooldownMs int, eff model.Effect) model.ItemDef {
	return withTriggers(id, model.Trigger{
		Type:       "cooldown",
		CooldownMs: cooldownMs,
		Effects:    []model.Effect{eff},
	})
}

func atFightStart(id string, eff model.Effect) model.ItemDef {
	return withTriggers(id, model.Trigger{
		Type:    "at_fight_start",
		Effects: []model.Effect{eff},
	})
}

func onTakeDamage(id string, eff model.Effect) model.ItemDef {
	return withTriggers(id, model.Trigger{
		Type:    "on_take_damage",
		Effects: []model.Effect{eff},
	})
}

func whenAdjacentFires(id string, eff model.Effect) model.ItemDef {
	return withTriggers(id, model.Trigger{
		Type:    "when_adjacent_fires",
		Effects: []model.Effect{eff},
	})
}

func withTriggers(id string, triggers ...model.Trigger) model.ItemDef {
	return model.ItemDef{ID: id, Name: id, Triggers: triggers}
}

func taggedDamager(id string, cooldownMs, dmg int, tag string) model.ItemDef {
	d := damager(id, cooldownMs, dmg)
	d.Tags = []string{tag}
	return d
}
