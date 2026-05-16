package combat

import (
	"testing"

	"github.com/jmelahman/gameslop/internal/model"
)

// shielder builds an item that grants shield to its own player at fight
// start. Useful for exercising the damage-into-shield codepath.
func shielder(id string, value int) model.ItemDef {
	return model.ItemDef{
		ID:   id,
		Name: id,
		Triggers: []model.Trigger{
			{
				Type: "at_fight_start",
				Effects: []model.Effect{
					{Op: "shield", Target: "self_player", Value: value},
				},
			},
		},
	}
}

// burner / poisoner build single-cooldown items that apply DoT stacks. The
// short cooldown lets tests observe several status_tick rounds quickly.
func burner(id string, cdMs, stacks int) model.ItemDef {
	return model.ItemDef{
		ID:   id,
		Name: id,
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: cdMs,
				Effects: []model.Effect{
					{Op: "burn", Target: "opponent_random", Value: stacks},
				},
			},
		},
	}
}

func poisoner(id string, cdMs, stacks int) model.ItemDef {
	return model.ItemDef{
		ID:   id,
		Name: id,
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: cdMs,
				Effects: []model.Effect{
					{Op: "poison", Target: "opponent_random", Value: stacks},
				},
			},
		},
	}
}

func TestShield_AbsorbsDamageAndEmitsBreak(t *testing.T) {
	cat := fakeCatalog{
		"sword":  damager("sword", 1000, 12),
		"shield": shielder("shield", 8),
	}
	// One-shot fight: opponent fires once at tick 10 then dies on a 12 hp pool.
	// Player shield 8 absorbs first 8 of the 12-damage hit; HP drops by 4.
	res := Simulate(
		[]model.BoardItem{{ItemID: "sword", Slot: 0}, {ItemID: "shield", Slot: 1}},
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		20, 5, 0, cat,
	)
	// Player sword fires at tick 10 dealing 12 → opponent dies before being hit.
	// But opponent fires at the same tick 10 → 12 damage hits player shield 8 + 4 hp.
	if res.PlayerEndHP != 16 {
		t.Fatalf("expected 16 HP after 12-dmg hit through 8 shield, got %d", res.PlayerEndHP)
	}
	hasBreak := false
	for _, ev := range res.Ticks {
		if ev.Type == "shield_broken" && ev.Target == "player" {
			hasBreak = true
		}
	}
	if !hasBreak {
		t.Fatalf("expected a shield_broken event, log=%+v", res.Ticks)
	}
}

func TestShield_NoBreakWhenShieldSurvives(t *testing.T) {
	// Player one-shots opponent at tick 10 before shield can be touched.
	cat := fakeCatalog{
		"big":    damager("big", 1000, 50),
		"shield": shielder("shield", 10),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "big", Slot: 0}, {ItemID: "shield", Slot: 1}},
		nil,
		20, 5, 0, cat,
	)
	for _, ev := range res.Ticks {
		if ev.Type == "shield_broken" {
			t.Fatalf("did not expect shield_broken, got %+v", ev)
		}
	}
}

func TestPoison_DealsOverTimeBypassingShield(t *testing.T) {
	cat := fakeCatalog{
		"vile":   poisoner("vile", 500, 3),
		"shield": shielder("shield", 50),
	}
	// Opponent has shield; poison should bypass it.
	res := Simulate(
		[]model.BoardItem{{ItemID: "vile", Slot: 0}},
		[]model.BoardItem{{ItemID: "shield", Slot: 0}},
		50, 20, 0, cat,
	)
	if res.OpponentEndHP >= 20 {
		t.Fatalf("expected poison to bypass shield, opponent HP=%d", res.OpponentEndHP)
	}
	tickCount := 0
	for _, ev := range res.Ticks {
		if ev.Type == "status_tick" && ev.Source == "poison" && ev.Target == "opponent" {
			tickCount++
		}
	}
	if tickCount == 0 {
		t.Fatalf("expected poison status_tick events, got 0")
	}
}

func TestBurn_EatsShieldFirst(t *testing.T) {
	// Compare burn vs poison against the same massive shield: burn should
	// eat shield, poison should bypass it.
	burnCat := fakeCatalog{
		"flame":  burner("flame", 5000, 3),
		"shield": shielder("shield", 100),
	}
	poisonCat := fakeCatalog{
		"vile":   poisoner("vile", 5000, 3),
		"shield": shielder("shield", 100),
	}
	burn := Simulate(
		[]model.BoardItem{{ItemID: "flame", Slot: 0}},
		[]model.BoardItem{{ItemID: "shield", Slot: 0}},
		200, 30, 0, burnCat,
	)
	pois := Simulate(
		[]model.BoardItem{{ItemID: "vile", Slot: 0}},
		[]model.BoardItem{{ItemID: "shield", Slot: 0}},
		200, 30, 0, poisonCat,
	)
	if pois.OpponentEndHP >= burn.OpponentEndHP {
		t.Fatalf("expected burn to spare HP vs poison; burn=%d poison=%d",
			burn.OpponentEndHP, pois.OpponentEndHP)
	}
}

func TestFreeze_HaltsItemCooldown(t *testing.T) {
	// Source has a freeze trigger; target sword would normally fire often.
	freezeItem := model.ItemDef{
		ID:   "freezer",
		Name: "freezer",
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: 200,
				Effects: []model.Effect{
					{Op: "freeze", Target: "opponent_front", DurationMs: 5000},
				},
			},
		},
	}
	cat := fakeCatalog{
		"freezer": freezeItem,
		"sword":   damager("sword", 300, 5),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "freezer", Slot: 0}},
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		50, 50, 0, cat,
	)
	// status_applied with freeze must appear; the opponent sword should be
	// completely locked down because the freezer reapplies before each thaw.
	statusApplied := 0
	swordFires := 0
	for _, ev := range res.Ticks {
		if ev.Type == "status_applied" {
			statusApplied++
		}
		if ev.Type == "item_fired" && ev.Source == "opponent:sword" {
			swordFires++
		}
	}
	if statusApplied == 0 {
		t.Fatalf("expected at least one freeze status_applied event")
	}
	if swordFires != 0 {
		t.Fatalf("expected sword to be fully locked, fired %d times", swordFires)
	}
}

func TestHaste_SpeedsUpAdjacentItems(t *testing.T) {
	// Banner hastes adjacent weapons whenever they fire, so the sword next to
	// it should fire more times than an isolated sword in a baseline fight.
	bannerDef := model.ItemDef{
		ID:   "banner",
		Name: "banner",
		Tags: []string{"Banner"},
		Triggers: []model.Trigger{
			{
				Type: "when_adjacent_fires",
				Effects: []model.Effect{
					{Op: "haste", Target: "self_adjacent", Value: 100, DurationMs: 800},
				},
			},
		},
	}
	cat := fakeCatalog{
		"banner": bannerDef,
		"sword":  damager("sword", 1000, 1),
	}
	withBanner := Simulate(
		[]model.BoardItem{{ItemID: "banner", Slot: 0}, {ItemID: "sword", Slot: 1}},
		nil,
		200, 200, 0, cat,
	)
	without := Simulate(
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		nil,
		200, 200, 0, cat,
	)
	withFires := countItemFires(withBanner.Ticks, "player:sword")
	withoutFires := countItemFires(without.Ticks, "player:sword")
	if withFires <= withoutFires {
		t.Fatalf("expected banner to make sword fire more often, with=%d without=%d",
			withFires, withoutFires)
	}
}

func TestBuff_AddsDamageBonus(t *testing.T) {
	bannerDef := model.ItemDef{
		ID:   "banner",
		Name: "banner",
		Triggers: []model.Trigger{
			{
				Type: "at_fight_start",
				Effects: []model.Effect{
					{Op: "buff", Target: "self_all_weapons", Value: 5},
				},
			},
		},
	}
	swordDef := damager("sword", 1000, 1)
	swordDef.Tags = []string{"Weapon"}
	cat := fakeCatalog{
		"banner": bannerDef,
		"sword":  swordDef,
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "banner", Slot: 0}, {ItemID: "sword", Slot: 1}},
		nil,
		50, 50, 0, cat,
	)
	// First sword fire (tick 10) should deal 1+5 = 6 damage.
	for _, ev := range res.Ticks {
		if ev.Type == "damage" && ev.Source == "player:sword" {
			if ev.Value != 6 {
				t.Fatalf("expected buffed damage 6, got %d (%+v)", ev.Value, ev)
			}
			return
		}
	}
	t.Fatal("no damage event emitted")
}

func TestOnTakeDamage_FiresHeal(t *testing.T) {
	// Phoenix-style trinket heals 4 every time owner is hit.
	phoenix := model.ItemDef{
		ID:   "phoenix",
		Name: "phoenix",
		Triggers: []model.Trigger{
			{
				Type: "on_take_damage",
				Effects: []model.Effect{
					{Op: "heal", Target: "self_player", Value: 4},
				},
			},
		},
	}
	cat := fakeCatalog{
		"phoenix": phoenix,
		"sword":   damager("sword", 1000, 5),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "phoenix", Slot: 0}},
		[]model.BoardItem{{ItemID: "sword", Slot: 0}},
		20, 100, 0, cat,
	)
	heals := 0
	for _, ev := range res.Ticks {
		if ev.Type == "heal" && ev.Source == "player:phoenix" && ev.Target == "player" {
			heals++
		}
	}
	if heals == 0 {
		t.Fatalf("expected phoenix to emit heal events on damage, got 0")
	}
}

func TestOnKill_GainsGold(t *testing.T) {
	// Vampiric trinket granting +5 gold on kill.
	vamp := model.ItemDef{
		ID:   "vamp",
		Name: "vamp",
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: 500,
				Effects: []model.Effect{
					{Op: "damage", Target: "opponent_random", Value: 10},
				},
			},
			{
				Type: "on_kill",
				Effects: []model.Effect{
					{Op: "gain_gold", Target: "self_player", Value: 5},
				},
			},
		},
	}
	cat := fakeCatalog{"vamp": vamp}
	res := Simulate(
		[]model.BoardItem{{ItemID: "vamp", Slot: 0}},
		nil,
		20, 5, 0, cat,
	)
	if res.Outcome != model.CombatOutcomeWin {
		t.Fatalf("expected win, got %q", res.Outcome)
	}
	hasGold := false
	for _, ev := range res.Ticks {
		if ev.Type == "gain_gold" && ev.Value == 5 {
			hasGold = true
		}
	}
	if !hasGold {
		t.Fatal("expected gain_gold event from on_kill")
	}
}

func TestAtFightStart_FiresBeforeTickOne(t *testing.T) {
	cat := fakeCatalog{
		"shield": shielder("shield", 10),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "shield", Slot: 0}},
		nil,
		20, 5, 0, cat,
	)
	// shield_applied must appear at tick 0.
	found := false
	for _, ev := range res.Ticks {
		if ev.Type == "shield_applied" && ev.Tick == 0 {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected shield_applied at tick 0, log=%+v", res.Ticks)
	}
}

func TestWhenAdjacentFires_QueuesEffect(t *testing.T) {
	// Lightning rod fires a small bonus every time an adjacent item fires.
	rod := model.ItemDef{
		ID:   "rod",
		Name: "rod",
		Triggers: []model.Trigger{
			{
				Type: "when_adjacent_fires",
				Effects: []model.Effect{
					{Op: "damage", Target: "opponent_random", Value: 2},
				},
			},
		},
	}
	cat := fakeCatalog{
		"rod":   rod,
		"sword": damager("sword", 1000, 1),
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "rod", Slot: 0}, {ItemID: "sword", Slot: 1}},
		nil,
		20, 200, 0, cat,
	)
	rodHits := 0
	for _, ev := range res.Ticks {
		if ev.Type == "damage" && ev.Source == "player:rod" {
			rodHits++
		}
	}
	if rodHits == 0 {
		t.Fatalf("expected rod to deal damage when sword fires, log=%+v", res.Ticks)
	}
}

func TestOpponentAll_DealsDamageOnce(t *testing.T) {
	// opponent_all is a single hit on the side regardless of how many items
	// the opponent owns — HP is a single pool.
	storm := model.ItemDef{
		ID:   "storm",
		Name: "storm",
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: 1000,
				Effects: []model.Effect{
					{Op: "damage", Target: "opponent_all", Value: 4},
				},
			},
		},
	}
	cat := fakeCatalog{"storm": storm, "filler": damager("filler", 9999, 0)}
	res := Simulate(
		[]model.BoardItem{{ItemID: "storm", Slot: 0}},
		[]model.BoardItem{
			{ItemID: "filler", Slot: 0},
			{ItemID: "filler", Slot: 1},
			{ItemID: "filler", Slot: 2},
		},
		50, 50, 0, cat,
	)
	// Each fire should deal exactly one 4-damage hit, not three.
	for _, ev := range res.Ticks {
		if ev.Type == "damage" && ev.Value != 4 {
			t.Fatalf("opponent_all damage should be 4 per tick, got %+v", ev)
		}
	}
}

func TestModifierExpiresAfterDuration(t *testing.T) {
	// A 200ms haste should drop off after 200ms of decay; we verify by
	// checking that the modifier slice empties out by mid-fight.
	hasteSelf := model.ItemDef{
		ID:   "self",
		Name: "self",
		Triggers: []model.Trigger{
			{
				Type: "at_fight_start",
				Effects: []model.Effect{
					{Op: "haste", Target: "self_item", Value: 100, DurationMs: 200},
				},
			},
		},
	}
	cat := fakeCatalog{"self": hasteSelf}
	state := &LiveState{
		PlayerHP:      50,
		PlayerMaxHP:   50,
		OpponentHP:    50,
		OpponentMaxHP: 50,
		PlayerItems:   buildLiveItems([]model.BoardItem{{ItemID: "self", Slot: 0}}, model.SidePlayer, cat),
	}
	res := &model.CombatResult{Ticks: []model.TickEvent{}}
	// Run the at_fight_start application manually then advance a few ticks of
	// decay to confirm modifiers list shrinks.
	fireAtFightStart(state, cat, nil, res)
	if len(state.PlayerItems[0].Modifiers) != 1 {
		t.Fatalf("expected 1 modifier post-fight-start, got %d", len(state.PlayerItems[0].Modifiers))
	}
	// 200ms / TickMs(100) = 2 decay ticks.
	for i := 0; i < 3; i++ {
		decayModifiers(state)
	}
	if len(state.PlayerItems[0].Modifiers) != 0 {
		t.Fatalf("expected modifier to expire, still %d", len(state.PlayerItems[0].Modifiers))
	}
}

func TestEnchantmentMergesIntoTriggers(t *testing.T) {
	// Custom catalog where the enchantment adds an at_fight_start shield.
	itemDef := model.ItemDef{
		ID:   "blade",
		Name: "blade",
		Tags: []string{"Weapon"},
		Triggers: []model.Trigger{
			{Type: "cooldown", CooldownMs: 1000, Effects: []model.Effect{
				{Op: "damage", Target: "opponent_random", Value: 1},
			}},
		},
	}
	cat := enchantingCatalog{
		items: map[string]model.ItemDef{"blade": itemDef},
		ench: map[string]model.Enchantment{
			"warded": {
				ID:        "warded",
				Name:      "Warded",
				AppliesTo: []string{"Weapon"},
				Triggers: []model.Trigger{
					{Type: "at_fight_start", Effects: []model.Effect{
						{Op: "shield", Target: "self_player", Value: 7},
					}},
				},
			},
		},
	}
	res := Simulate(
		[]model.BoardItem{{ItemID: "blade", Slot: 0, Enchantments: []string{"warded"}}},
		nil,
		20, 100, 0, cat,
	)
	found := false
	for _, ev := range res.Ticks {
		if ev.Type == "shield_applied" && ev.Tick == 0 && ev.Value == 7 {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected enchantment to add a shield_applied event at tick 0, log=%+v", res.Ticks)
	}
}

// Bazaar-style synergy: a banner buffing two adjacent weapons should kill an
// opponent with the same raw item count *much* faster than the unbuffed
// reference board.
func TestSynergy_BannerBuffsWeaponsBeatsRandomBoard(t *testing.T) {
	banner := model.ItemDef{
		ID:   "banner",
		Name: "banner",
		Triggers: []model.Trigger{
			{Type: "at_fight_start", Effects: []model.Effect{
				{Op: "buff", Target: "self_all_weapons", Value: 4},
			}},
		},
	}
	swordDef := damager("sword", 1000, 3)
	swordDef.Tags = []string{"Weapon"}
	cat := fakeCatalog{"banner": banner, "sword": swordDef, "filler": damager("filler", 1000, 1)}

	synergy := []model.BoardItem{
		{ItemID: "sword", Slot: 0},
		{ItemID: "banner", Slot: 1},
		{ItemID: "sword", Slot: 2},
	}
	random := []model.BoardItem{
		{ItemID: "sword", Slot: 0},
		{ItemID: "filler", Slot: 1},
		{ItemID: "sword", Slot: 2},
	}
	const oppHP = 100
	synRes := Simulate(synergy, nil, 50, oppHP, 0, cat)
	rndRes := Simulate(random, nil, 50, oppHP, 0, cat)
	if synRes.Outcome != model.CombatOutcomeWin {
		t.Fatalf("synergy build should win, got %q", synRes.Outcome)
	}
	synEnd := lastTick(synRes.Ticks)
	rndEnd := lastTick(rndRes.Ticks)
	// Synergy must finish at least 25% sooner than the bare board.
	if synEnd*4 >= rndEnd*3 {
		t.Fatalf("expected synergy to kill faster: synergy=%d random=%d", synEnd, rndEnd)
	}
}

func countItemFires(ticks []model.TickEvent, source string) int {
	n := 0
	for _, ev := range ticks {
		if ev.Type == "item_fired" && ev.Source == source {
			n++
		}
	}
	return n
}

func lastTick(ticks []model.TickEvent) int {
	if len(ticks) == 0 {
		return 0
	}
	return ticks[len(ticks)-1].Tick
}

// enchantingCatalog is a richer test fake that satisfies both Item and
// Enchantment lookups, used by enchantment-aware tests.
type enchantingCatalog struct {
	items map[string]model.ItemDef
	ench  map[string]model.Enchantment
}

func (e enchantingCatalog) Item(id string) (model.ItemDef, bool) {
	d, ok := e.items[id]
	return d, ok
}

func (e enchantingCatalog) Enchantment(id string) (model.Enchantment, bool) {
	d, ok := e.ench[id]
	return d, ok
}
