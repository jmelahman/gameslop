// Package combat owns the deterministic fight simulator. It must not import
// internal/store or internal/db — Simulate is a pure function from board +
// opponent + seed to a tick log so it can be replayed, table-tested, and
// (later) ghost-replayed for PvP.
//
// engine.go holds the per-fight state machine and the tick loop. The public
// entry point lives in simulator.go; effect application lives in effects.go;
// target selection lives in targeting.go.
package combat

import (
	"math/rand/v2"
	"sort"

	"github.com/jmelahman/gameslop/internal/model"
)

// TickMs is the simulated wall-clock duration of one engine tick.
const TickMs = 100

// MaxTicks caps a single fight at 30 simulated seconds. If neither side
// has died by then the fight is declared a tie so the run can advance.
const MaxTicks = 300

// StatusTickMs is how often poison / burn stacks tick. Decoupled from TickMs
// so DoTs feel like distinct beats instead of per-frame chip damage.
const StatusTickMs = 1000

// Catalog is the minimal read-only item lookup the simulator needs. It is
// satisfied by *catalog.Catalog without an import cycle on that package.
type Catalog interface {
	Item(id string) (model.ItemDef, bool)
	Enchantment(id string) (model.Enchantment, bool)
}

// LiveItem is the in-engine representation of a board item during a fight.
// CooldownMs is the base cooldown copied from the item def's first cooldown
// trigger; RemainingMs counts down each tick. Modifiers carries haste / slow
// / freeze stacks; effective per-tick step is TickMs * Π(active multipliers).
// DamageBonus is added to every damage Effect this item produces (buff op).
type LiveItem struct {
	ItemID      string
	Slot        int
	Side        model.Side
	Size        int
	Tags        []string
	Triggers    []model.Trigger
	CooldownMs  int
	RemainingMs int
	DamageBonus int
	Modifiers   []TimedModifier
}

// TimedModifier is a transient cooldown-step multiplier (haste / slow) or a
// hard pause (freeze). Multiplier 0 freezes the item; <1 hastes it; >1 slows.
type TimedModifier struct {
	Kind        string
	Multiplier  float64
	RemainingMs int
}

// SideStatus is a stacking damage-over-time status on a combatant side. Phase
// 11 tracks two kinds: "poison" (bypasses shield) and "burn" (eats shield
// first). Stacks tick every StatusTickMs and decrement by 1 per tick.
type SideStatus struct {
	Kind        string
	Stacks      int
	RemainingMs int
}

// LiveState is the mutable per-fight state passed to effects and targeting.
// PlayerMaxHP / OpponentMaxHP cap heal effects at the starting HP totals.
// Shields absorb damage before HP and never go negative.
type LiveState struct {
	PlayerHP        int
	PlayerMaxHP     int
	PlayerShield    int
	OpponentHP      int
	OpponentMaxHP   int
	OpponentShield  int
	PlayerStatuses  []SideStatus
	OpponentStatuses []SideStatus
	PlayerItems    []*LiveItem
	OpponentItems  []*LiveItem
}

// effectiveStep returns the ms an item advances on a single tick. Modifier
// multipliers compose; a multiplier of 0 (freeze) keeps the item from
// advancing at all.
func effectiveStep(it *LiveItem) int {
	step := float64(TickMs)
	for _, m := range it.Modifiers {
		step *= m.Multiplier
	}
	if step <= 0 {
		return 0
	}
	if step < 1 {
		return 1
	}
	return int(step)
}

// stepItem decrements remainingMs for one tick. Returns true when the item
// is ready to fire — the caller resets RemainingMs after queuing effects.
// Items without a cooldown trigger never fire (CooldownMs == 0); they sit on
// the board purely for their at_fight_start / on_take_damage / on_kill /
// when_adjacent_fires triggers.
func stepItem(it *LiveItem) bool {
	if it.CooldownMs <= 0 {
		return false
	}
	it.RemainingMs -= effectiveStep(it)
	return it.RemainingMs <= 0
}

// buildLiveItems converts catalog references into the engine's working set.
// Unlike phase 7 we keep items even when they have no cooldown, because
// at_fight_start / when_adjacent_fires / on_kill triggers still need to fire.
func buildLiveItems(items []model.BoardItem, side model.Side, cat Catalog) []*LiveItem {
	sorted := make([]model.BoardItem, len(items))
	copy(sorted, items)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Slot < sorted[j].Slot })

	out := make([]*LiveItem, 0, len(sorted))
	for _, b := range sorted {
		def, ok := cat.Item(b.ItemID)
		if !ok {
			continue
		}
		merged := mergeEnchantments(def.Triggers, b.Enchantments, cat)
		size := def.Size
		if size < 1 {
			size = 1
		}
		cd := primaryCooldownMsFromTriggers(merged)
		out = append(out, &LiveItem{
			ItemID:      b.ItemID,
			Slot:        b.Slot,
			Side:        side,
			Size:        size,
			Tags:        def.Tags,
			Triggers:    merged,
			CooldownMs:  cd,
			RemainingMs: cd,
		})
	}
	return out
}

// mergeEnchantments returns base + every enchantment's triggers in a fresh
// slice. Order: base first, then enchantments in the order they appear on the
// BoardItem (so Item.Triggers reflects player choice).
func mergeEnchantments(base []model.Trigger, enchIDs []string, cat Catalog) []model.Trigger {
	if len(enchIDs) == 0 {
		return base
	}
	out := make([]model.Trigger, 0, len(base)+len(enchIDs))
	out = append(out, base...)
	for _, id := range enchIDs {
		ench, ok := cat.Enchantment(id)
		if !ok {
			continue
		}
		out = append(out, ench.Triggers...)
	}
	return out
}

// primaryCooldownMsFromTriggers returns the cooldown_ms of the first cooldown
// trigger in the merged list, or 0 if none.
func primaryCooldownMsFromTriggers(triggers []model.Trigger) int {
	for _, trig := range triggers {
		if trig.Type == "cooldown" && trig.CooldownMs > 0 {
			return trig.CooldownMs
		}
	}
	return 0
}

// pendingEffect pairs a queued effect with the live item that produced it so
// the effect handler can attribute event sources and look up modifiers.
type pendingEffect struct {
	source *LiveItem
	eff    model.Effect
}

// runEngine drives the tick loop until one or both sides die or MaxTicks is
// reached. Every emitted event lands in res.Ticks; HP totals and outcome are
// written when the fight ends.
//
// Per-tick order (deterministic):
//  1. (tick 0 only) Fire at_fight_start triggers.
//  2. Decrement timed modifiers; expired ones drop off.
//  3. Tick poison / burn stacks every StatusTickMs.
//  4. Decrement cooldowns left-to-right, player board before opponent board.
//     Items whose cooldowns hit zero this tick form the fired set in order.
//  5. For each fired item: emit item_fired, queue cooldown-trigger effects,
//     queue when_adjacent_fires effects from neighbours, reset remaining_ms.
//  6. Drain the effect queue (damage routed through shields; status applies).
//  7. Check HP. If either side died, emit deaths + fight_end and return.
func runEngine(state *LiveState, cat Catalog, rng *rand.Rand, res *model.CombatResult) {
	res.Ticks = append(res.Ticks, model.TickEvent{Tick: 0, Type: "fight_start"})

	// Phase 1: at_fight_start triggers run before any cooldowns advance.
	fireAtFightStart(state, cat, rng, res)
	if state.PlayerHP <= 0 || state.OpponentHP <= 0 {
		finishFight(state, 0, res)
		return
	}

	for tick := 1; tick <= MaxTicks; tick++ {
		// Decay timed modifiers (haste / slow / freeze).
		decayModifiers(state)

		// DoT: poison/burn stacks tick every StatusTickMs.
		tickStatuses(state, tick, res)
		if state.PlayerHP <= 0 || state.OpponentHP <= 0 {
			finishFight(state, tick, res)
			return
		}

		fired := collectFired(state)

		queue := make([]pendingEffect, 0, len(fired)*2)
		for _, it := range fired {
			res.Ticks = append(res.Ticks, model.TickEvent{
				Tick:   tick,
				Type:   "item_fired",
				Source: sourceTag(it),
			})
			for _, trig := range it.Triggers {
				if trig.Type != "cooldown" {
					continue
				}
				for _, eff := range trig.Effects {
					queue = append(queue, pendingEffect{source: it, eff: eff})
				}
				break
			}
			// when_adjacent_fires on neighbours: each neighbour queues its
			// effects sourced from itself, attributing the event correctly.
			for _, neighbour := range adjacentItems(state, it) {
				for _, trig := range neighbour.Triggers {
					if trig.Type != "when_adjacent_fires" {
						continue
					}
					for _, eff := range trig.Effects {
						queue = append(queue, pendingEffect{source: neighbour, eff: eff})
					}
				}
			}
			it.RemainingMs += it.CooldownMs
			if it.RemainingMs < 0 {
				it.RemainingMs = 0
			}
		}

		for _, p := range queue {
			applyEffect(state, p.source, p.eff, rng, tick, res)
		}

		if state.PlayerHP <= 0 || state.OpponentHP <= 0 {
			finishFight(state, tick, res)
			return
		}
	}

	// Timed out: neither side died inside MaxTicks. Plan calls this a tie.
	res.PlayerEndHP = state.PlayerHP
	res.OpponentEndHP = state.OpponentHP
	res.Outcome = model.CombatOutcomeTie
	res.Ticks = append(res.Ticks, model.TickEvent{Tick: MaxTicks, Type: "fight_end"})
}

// fireAtFightStart walks every item on both sides (player first) and queues
// effects from at_fight_start triggers, then drains them. Runs at tick 0
// before any cooldown advancement so the very first tick observes the result.
func fireAtFightStart(state *LiveState, cat Catalog, rng *rand.Rand, res *model.CombatResult) {
	queue := []pendingEffect{}
	for _, it := range state.PlayerItems {
		for _, trig := range it.Triggers {
			if trig.Type != "at_fight_start" {
				continue
			}
			for _, eff := range trig.Effects {
				queue = append(queue, pendingEffect{source: it, eff: eff})
			}
		}
	}
	for _, it := range state.OpponentItems {
		for _, trig := range it.Triggers {
			if trig.Type != "at_fight_start" {
				continue
			}
			for _, eff := range trig.Effects {
				queue = append(queue, pendingEffect{source: it, eff: eff})
			}
		}
	}
	for _, p := range queue {
		applyEffect(state, p.source, p.eff, rng, 0, res)
	}
	_ = cat
}

// decayModifiers advances each timed modifier on every live item by TickMs;
// expired modifiers (RemainingMs <= 0) fall off in-place.
func decayModifiers(state *LiveState) {
	for _, it := range state.PlayerItems {
		it.Modifiers = decayItemModifiers(it.Modifiers)
	}
	for _, it := range state.OpponentItems {
		it.Modifiers = decayItemModifiers(it.Modifiers)
	}
}

func decayItemModifiers(mods []TimedModifier) []TimedModifier {
	if len(mods) == 0 {
		return mods
	}
	out := mods[:0]
	for _, m := range mods {
		m.RemainingMs -= TickMs
		if m.RemainingMs > 0 {
			out = append(out, m)
		}
	}
	return out
}

// tickStatuses advances poison / burn timers and applies damage when their
// per-stack timer expires. Each application emits a status_tick event so the
// frontend can show the chip damage drip.
func tickStatuses(state *LiveState, tick int, res *model.CombatResult) {
	state.PlayerStatuses = applySideStatuses(state, model.SidePlayer, state.PlayerStatuses, tick, res)
	state.OpponentStatuses = applySideStatuses(state, model.SideOpponent, state.OpponentStatuses, tick, res)
}

func applySideStatuses(
	state *LiveState,
	side model.Side,
	statuses []SideStatus,
	tick int,
	res *model.CombatResult,
) []SideStatus {
	if len(statuses) == 0 {
		return statuses
	}
	out := statuses[:0]
	for _, s := range statuses {
		s.RemainingMs -= TickMs
		if s.RemainingMs > 0 {
			out = append(out, s)
			continue
		}
		// One status tick: deal `Stacks` damage (burn eats shield first,
		// poison bypasses), decrement stacks, restart the timer.
		if s.Stacks > 0 {
			applyStatusDamage(state, side, s.Kind, s.Stacks, tick, res)
		}
		s.Stacks--
		s.RemainingMs = StatusTickMs
		if s.Stacks > 0 {
			out = append(out, s)
		}
	}
	return out
}

// applyStatusDamage deals DoT damage attributed to the status kind. Burn eats
// shield before HP; poison bypasses shield entirely. The emitted event is
// status_tick with the source equal to the status kind.
func applyStatusDamage(
	state *LiveState,
	side model.Side,
	kind string,
	value, tick int,
	res *model.CombatResult,
) {
	if value <= 0 {
		return
	}
	hpBefore, shieldBefore := readHP(state, side)
	switch kind {
	case "poison":
		writeHP(state, side, hpBefore-value, shieldBefore)
	case "burn":
		shield, hp := absorbWithShield(shieldBefore, hpBefore, value)
		writeHP(state, side, hp, shield)
		if shieldBefore > 0 && shield == 0 {
			res.Ticks = append(res.Ticks, model.TickEvent{
				Tick: tick, Type: "shield_broken", Target: string(side),
			})
		}
	}
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick: tick, Type: "status_tick", Source: kind, Target: string(side), Value: value,
	})
}

// adjacentItems returns the at-most-two items adjacent to `target` on the
// same side, accounting for multi-slot widths. Two items A and B are
// adjacent when one's right edge meets the other's left edge.
func adjacentItems(state *LiveState, target *LiveItem) []*LiveItem {
	pool := state.OpponentItems
	if target.Side == model.SidePlayer {
		pool = state.PlayerItems
	}
	out := []*LiveItem{}
	for _, other := range pool {
		if other == target {
			continue
		}
		if other.Slot+other.Size == target.Slot || target.Slot+target.Size == other.Slot {
			out = append(out, other)
		}
	}
	return out
}

// collectFired advances cooldowns on both sides and returns the items ready
// to fire this tick in player-then-opponent slot order.
func collectFired(state *LiveState) []*LiveItem {
	fired := make([]*LiveItem, 0)
	for _, it := range state.PlayerItems {
		if stepItem(it) {
			fired = append(fired, it)
		}
	}
	for _, it := range state.OpponentItems {
		if stepItem(it) {
			fired = append(fired, it)
		}
	}
	return fired
}

// finishFight emits death events for whichever side(s) hit zero this tick
// followed by fight_end, and snapshots final HP / outcome onto res.
func finishFight(state *LiveState, tick int, res *model.CombatResult) {
	if state.PlayerHP <= 0 {
		res.Ticks = append(res.Ticks, model.TickEvent{
			Tick:   tick,
			Type:   "death",
			Target: string(model.SidePlayer),
		})
	}
	if state.OpponentHP <= 0 {
		res.Ticks = append(res.Ticks, model.TickEvent{
			Tick:   tick,
			Type:   "death",
			Target: string(model.SideOpponent),
		})
	}
	res.PlayerEndHP = state.PlayerHP
	res.OpponentEndHP = state.OpponentHP
	res.Outcome = outcomeFor(state.PlayerHP, state.OpponentHP)
	res.Ticks = append(res.Ticks, model.TickEvent{Tick: tick, Type: "fight_end"})
}

// outcomeFor turns post-fight HP into the high-level outcome.
func outcomeFor(playerHP, opponentHP int) model.CombatOutcome {
	playerDead := playerHP <= 0
	opponentDead := opponentHP <= 0
	switch {
	case playerDead && opponentDead:
		return model.CombatOutcomeTie
	case opponentDead:
		return model.CombatOutcomeWin
	case playerDead:
		return model.CombatOutcomeLoss
	default:
		return model.CombatOutcomeTie
	}
}

// sourceTag formats the "side:item_id" string used in TickEvent.Source.
func sourceTag(it *LiveItem) string {
	return string(it.Side) + ":" + it.ItemID
}

// readHP / writeHP / absorbWithShield centralise the side-keyed HP +
// shield bookkeeping so handlers don't repeat a 4-line switch every time.
func readHP(state *LiveState, side model.Side) (hp, shield int) {
	if side == model.SidePlayer {
		return state.PlayerHP, state.PlayerShield
	}
	return state.OpponentHP, state.OpponentShield
}

func writeHP(state *LiveState, side model.Side, hp, shield int) {
	if shield < 0 {
		shield = 0
	}
	if side == model.SidePlayer {
		state.PlayerHP = hp
		state.PlayerShield = shield
		return
	}
	state.OpponentHP = hp
	state.OpponentShield = shield
}

// absorbWithShield drains shield first, then HP. Returns the new shield + hp.
func absorbWithShield(shield, hp, dmg int) (newShield, newHP int) {
	if dmg <= 0 {
		return shield, hp
	}
	if shield >= dmg {
		return shield - dmg, hp
	}
	return 0, hp - (dmg - shield)
}
