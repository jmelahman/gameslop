package combat

import (
	"encoding/json"
	"testing"

	"github.com/jmelahman/gameslop/internal/model"
)

// fakeCatalog is a minimal Catalog impl backed by a map literal so individual
// tests can author the exact items they need without booting the real
// embedded JSON catalog.
type fakeCatalog map[string]model.ItemDef

func (f fakeCatalog) Item(id string) (model.ItemDef, bool) {
	d, ok := f[id]
	return d, ok
}

// damager builds an item def whose only trigger is a cooldown that deals
// `dmg` damage to a random opponent target.
func damager(id string, cooldownMs, dmg int) model.ItemDef {
	return model.ItemDef{
		ID:   id,
		Name: id,
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: cooldownMs,
				Effects:    []model.Effect{{Op: "damage", Target: "opponent_random", Value: dmg}},
			},
		},
	}
}

// healer builds an item def whose cooldown trigger heals the owner.
func healer(id string, cooldownMs, amount int) model.ItemDef {
	return model.ItemDef{
		ID:   id,
		Name: id,
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: cooldownMs,
				Effects:    []model.Effect{{Op: "heal", Target: "self_player", Value: amount}},
			},
		},
	}
}

func TestSimulate_PlayerWinsWithSingleSword(t *testing.T) {
	cat := fakeCatalog{
		"sword": damager("sword", 1000, 10),
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
	// Sword has cooldown_ms=1000 with TickMs=100 → fires at tick 10.
	// Expected log: fight_start@0, item_fired@10, damage@10, death@10, fight_end@10.
	want := []model.TickEvent{
		{Tick: 0, Type: "fight_start"},
		{Tick: 10, Type: "item_fired", Source: "player:sword"},
		{Tick: 10, Type: "damage", Source: "player:sword", Target: "opponent", Value: 10},
		{Tick: 10, Type: "death", Target: "opponent"},
		{Tick: 10, Type: "fight_end"},
	}
	assertTicksEqual(t, want, res.Ticks)
}

func TestSimulate_PlayerLoses(t *testing.T) {
	cat := fakeCatalog{
		"sword": damager("sword", 1000, 10),
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

func TestSimulate_TimeoutIsTie(t *testing.T) {
	// Empty boards never deal damage → engine runs to MaxTicks then ties.
	cat := fakeCatalog{}
	res := Simulate(nil, nil, 10, 10, 0, cat)
	if res.Outcome != model.CombatOutcomeTie {
		t.Fatalf("expected tie, got %q", res.Outcome)
	}
	if last := res.Ticks[len(res.Ticks)-1]; last.Type != "fight_end" || last.Tick != MaxTicks {
		t.Fatalf("expected fight_end at tick %d, got %+v", MaxTicks, last)
	}
}

func TestSimulate_MutualKOIsTie(t *testing.T) {
	// Both sides fire on the same tick and each kills the other.
	cat := fakeCatalog{
		"big_sword": damager("big_sword", 1000, 50),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "big_sword", Slot: 0}},
		[]model.BoardItem{{ItemID: "big_sword", Slot: 0}},
		10, 10, 0, cat,
	)
	if res.Outcome != model.CombatOutcomeTie {
		t.Fatalf("expected tie, got %q", res.Outcome)
	}
	// Two death events expected — both sides at zero on tick 10.
	deaths := 0
	for _, e := range res.Ticks {
		if e.Type == "death" {
			deaths++
		}
	}
	if deaths != 2 {
		t.Fatalf("expected 2 death events on mutual KO, got %d", deaths)
	}
}

func TestSimulate_HealEmitsHealEvent(t *testing.T) {
	cat := fakeCatalog{
		"potion": healer("potion", 500, 3),
		"sword":  damager("sword", 1000, 5),
	}
	// Player takes a hit from opponent sword, then own potion heals back.
	res := Simulate(
		[]model.BoardItem{{ItemID: "potion", Slot: 0}},
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		20, 100, 0, cat,
	)
	// Potion fires every 5 ticks (at ticks 5, 10, 15, ...); the heal event
	// should appear at least once before fight_end.
	heals := 0
	for _, e := range res.Ticks {
		if e.Type == "heal" {
			heals++
		}
	}
	if heals == 0 {
		t.Fatalf("expected at least one heal event, got 0 in %d events", len(res.Ticks))
	}
}

func TestSimulate_HealCapsAtMaxHP(t *testing.T) {
	// Player at full HP can't be healed above MaxHP — the heal event should
	// either be omitted or carry a clamped value.
	cat := fakeCatalog{
		"potion": healer("potion", 100, 50),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "potion", Slot: 0}},
		nil,
		30, 30, 0, cat,
	)
	for _, e := range res.Ticks {
		if e.Type == "heal" && e.Value+30 > 30 {
			t.Fatalf("heal overshot max HP: %+v", e)
		}
	}
	// Player must remain at exactly starting HP.
	if res.PlayerEndHP != 30 {
		t.Fatalf("expected player HP=30 (capped), got %d", res.PlayerEndHP)
	}
}

func TestSimulate_DeterministicByteIdentical(t *testing.T) {
	// Golden-file style: re-running the same combat must produce the exact
	// same tick log down to the JSON byte representation. This is the core
	// determinism guarantee the engine relies on for replay.
	cat := fakeCatalog{
		"a":      damager("a", 300, 3),
		"b":      damager("b", 700, 5),
		"potion": healer("potion", 1500, 4),
	}
	player := []model.BoardItem{
		{ItemID: "a", Slot: 0},
		{ItemID: "b", Slot: 1},
	}
	opp := []model.BoardItem{
		{ItemID: "a", Slot: 0},
		{ItemID: "potion", Slot: 1},
	}
	const seed int64 = 0xdeadbeef

	r1 := Simulate(player, opp, 50, 50, seed, cat)
	r2 := Simulate(player, opp, 50, 50, seed, cat)

	b1, err := json.Marshal(r1)
	if err != nil {
		t.Fatalf("marshal r1: %v", err)
	}
	b2, err := json.Marshal(r2)
	if err != nil {
		t.Fatalf("marshal r2: %v", err)
	}
	if string(b1) != string(b2) {
		t.Fatalf("non-deterministic: \n%s\nvs\n%s", b1, b2)
	}
}

func TestSimulate_DeterministicAcrossSeeds(t *testing.T) {
	// Different seeds must produce identical results in phase 7 because no
	// targeting mode currently consumes RNG. (When phase 11 adds multi-target
	// modes this test will be replaced with a per-seed expectation.)
	cat := fakeCatalog{"a": damager("a", 200, 2)}
	player := []model.BoardItem{{ItemID: "a", Slot: 0}}
	r1 := Simulate(player, nil, 50, 10, 1, cat)
	r2 := Simulate(player, nil, 50, 10, 999, cat)
	if r1.Outcome != r2.Outcome {
		t.Fatalf("outcome diverged across seeds: %q vs %q", r1.Outcome, r2.Outcome)
	}
	if len(r1.Ticks) != len(r2.Ticks) {
		t.Fatalf("tick counts diverged: %d vs %d", len(r1.Ticks), len(r2.Ticks))
	}
}

func TestSimulate_GoldenTickLogTwoSwords(t *testing.T) {
	// Snapshot test: a specific scenario whose entire tick log is asserted
	// event-by-event. Any engine change that perturbs ordering, timing, or
	// the event schema fails here and forces a deliberate update.
	cat := fakeCatalog{
		"fast": damager("fast", 200, 2), // fires every 2 ticks
		"slow": damager("slow", 500, 5), // fires every 5 ticks
	}
	player := []model.BoardItem{
		{ItemID: "fast", Slot: 0},
		{ItemID: "slow", Slot: 1},
	}
	res := Simulate(player, nil, 30, 12, 0, cat)

	// Damage trace against 12 HP:
	//   t=2 fast →10, t=4 fast →8, t=5 slow →3, t=6 fast →1, t=8 fast →-1
	// Opponent dies at tick 8 from fast's hit.
	want := []model.TickEvent{
		{Tick: 0, Type: "fight_start"},
		{Tick: 2, Type: "item_fired", Source: "player:fast"},
		{Tick: 2, Type: "damage", Source: "player:fast", Target: "opponent", Value: 2},
		{Tick: 4, Type: "item_fired", Source: "player:fast"},
		{Tick: 4, Type: "damage", Source: "player:fast", Target: "opponent", Value: 2},
		{Tick: 5, Type: "item_fired", Source: "player:slow"},
		{Tick: 5, Type: "damage", Source: "player:slow", Target: "opponent", Value: 5},
		{Tick: 6, Type: "item_fired", Source: "player:fast"},
		{Tick: 6, Type: "damage", Source: "player:fast", Target: "opponent", Value: 2},
		{Tick: 8, Type: "item_fired", Source: "player:fast"},
		{Tick: 8, Type: "damage", Source: "player:fast", Target: "opponent", Value: 2},
		{Tick: 8, Type: "death", Target: "opponent"},
		{Tick: 8, Type: "fight_end"},
	}
	assertTicksEqual(t, want, res.Ticks)
	if res.Outcome != model.CombatOutcomeWin {
		t.Fatalf("expected win, got %q", res.Outcome)
	}
}

func TestSimulate_GoldenTickLogPlayerOpponentInterleave(t *testing.T) {
	// Both sides own the same item; player fires first within a tick per the
	// engine's left-to-right, player-before-opponent ordering rule.
	cat := fakeCatalog{
		"sword": damager("sword", 300, 4),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		8, 8, 0, cat,
	)
	want := []model.TickEvent{
		{Tick: 0, Type: "fight_start"},
		{Tick: 3, Type: "item_fired", Source: "player:sword"},
		{Tick: 3, Type: "item_fired", Source: "opponent:sword"},
		{Tick: 3, Type: "damage", Source: "player:sword", Target: "opponent", Value: 4},
		{Tick: 3, Type: "damage", Source: "opponent:sword", Target: "player", Value: 4},
		{Tick: 6, Type: "item_fired", Source: "player:sword"},
		{Tick: 6, Type: "item_fired", Source: "opponent:sword"},
		{Tick: 6, Type: "damage", Source: "player:sword", Target: "opponent", Value: 4},
		{Tick: 6, Type: "damage", Source: "opponent:sword", Target: "player", Value: 4},
		{Tick: 6, Type: "death", Target: "player"},
		{Tick: 6, Type: "death", Target: "opponent"},
		{Tick: 6, Type: "fight_end"},
	}
	assertTicksEqual(t, want, res.Ticks)
	if res.Outcome != model.CombatOutcomeTie {
		t.Fatalf("expected tie, got %q", res.Outcome)
	}
}

func TestSimulate_NoCooldownItemNeverFires(t *testing.T) {
	// Items whose only trigger is on_sell or at_fight_start are silent
	// during combat in phase 7 — they shouldn't emit item_fired events.
	cat := fakeCatalog{
		"trinket": model.ItemDef{
			ID:   "trinket",
			Name: "trinket",
			Triggers: []model.Trigger{
				{Type: "on_sell", Effects: []model.Effect{
					{Op: "gain_gold", Target: "self_player", Value: 2},
				}},
			},
		},
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "trinket", Slot: 0}},
		nil,
		10, 10, 0, cat,
	)
	for _, e := range res.Ticks {
		if e.Type == "item_fired" {
			t.Fatalf("trinket fired during combat: %+v", e)
		}
	}
}

func TestSimulate_TicksRespectMaxTicks(t *testing.T) {
	// A very long cooldown with HP that won't fall inside 30s must time out
	// rather than running forever.
	cat := fakeCatalog{
		"slowpoke": damager("slowpoke", 200, 1),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "slowpoke", Slot: 0}},
		nil,
		100, 10_000, 0, cat,
	)
	last := res.Ticks[len(res.Ticks)-1]
	if last.Tick > MaxTicks {
		t.Fatalf("fight exceeded MaxTicks: last tick %d", last.Tick)
	}
}

// assertTicksEqual is a tiny diff helper that prints the first divergence
// instead of dumping both slices into a wall of text.
func assertTicksEqual(t *testing.T, want, got []model.TickEvent) {
	t.Helper()
	if len(want) != len(got) {
		t.Fatalf("tick count mismatch: want %d got %d\nwant:\n%s\ngot:\n%s",
			len(want), len(got), dumpTicks(want), dumpTicks(got))
	}
	for i := range want {
		if want[i] != got[i] {
			t.Fatalf("event %d mismatch:\nwant %+v\ngot  %+v\nfull got:\n%s",
				i, want[i], got[i], dumpTicks(got))
		}
	}
}

func dumpTicks(t []model.TickEvent) string {
	out, _ := json.MarshalIndent(t, "", "  ")
	return string(out)
}
