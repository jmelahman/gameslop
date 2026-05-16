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

// Catalog is the minimal read-only item lookup the simulator needs. It is
// satisfied by *catalog.Catalog without an import cycle on that package.
type Catalog interface {
	Item(id string) (model.ItemDef, bool)
}

// LiveItem is the in-engine representation of a board item during a fight.
// CooldownMs is the base cooldown copied from the item def; RemainingMs is
// counted down each tick. Modifiers will carry haste/slow stacks in phase 11
// — for now the slice is always empty and the effective tick step is TickMs.
type LiveItem struct {
	ItemID      string
	Slot        int
	Side        model.Side
	CooldownMs  int
	RemainingMs int
	Modifiers   []TimedModifier
}

// TimedModifier is the placeholder shape for haste / slow stacks. Phase 7
// never instantiates one — it's defined now so the surrounding plumbing
// (Modifiers slice, multiplier product in effectiveStep) is stable.
type TimedModifier struct {
	Kind        string
	Multiplier  float64
	RemainingMs int
}

// LiveState is the mutable per-fight state passed to effects and targeting.
// PlayerMaxHP / OpponentMaxHP cap heal effects at the starting HP totals.
type LiveState struct {
	PlayerHP      int
	PlayerMaxHP   int
	OpponentHP    int
	OpponentMaxHP int
	PlayerItems   []*LiveItem
	OpponentItems []*LiveItem
}

// effectiveStep returns the ms an item advances on a single tick. Phase 7
// has no modifiers, so this always returns TickMs; phase 11 will multiply
// in haste/slow factors.
func effectiveStep(it *LiveItem) int {
	step := float64(TickMs)
	for _, m := range it.Modifiers {
		if m.Multiplier == 0 {
			continue
		}
		step *= m.Multiplier
	}
	if step < 1 {
		return 1
	}
	return int(step)
}

// stepItem decrements remainingMs for one tick. Returns true when the item
// is ready to fire — the caller resets RemainingMs after queuing effects.
func stepItem(it *LiveItem) bool {
	it.RemainingMs -= effectiveStep(it)
	return it.RemainingMs <= 0
}

// buildLiveItems converts catalog references into the engine's working set.
// Items with no cooldown trigger don't tick in phase 7 and are dropped so
// they don't pollute the fired-this-tick set; their on_sell / at_fight_start
// triggers will be wired in later phases.
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
		cd := primaryCooldownMs(def)
		if cd <= 0 {
			continue
		}
		out = append(out, &LiveItem{
			ItemID:      b.ItemID,
			Slot:        b.Slot,
			Side:        side,
			CooldownMs:  cd,
			RemainingMs: cd,
		})
	}
	return out
}

// primaryCooldownMs returns the cooldown_ms of the first cooldown trigger on
// the item, or 0 if the item has no cooldown trigger.
func primaryCooldownMs(def model.ItemDef) int {
	for _, trig := range def.Triggers {
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
//  1. Decrement cooldowns left-to-right, player board before opponent board.
//     Items whose cooldowns hit zero this tick form the fired set in that
//     same order.
//  2. For each fired item, emit item_fired and queue every effect under its
//     first cooldown trigger. Reset RemainingMs to the item's CooldownMs.
//  3. Drain the effect queue (damage, heal — others are no-ops in phase 7).
//  4. (Reserved for when_adjacent_fires triggers; not implemented yet.)
//  5. Check HP. If either side died, emit death events for whoever died and
//     fight_end, then return. Both ≤ 0 on the same tick is a tie.
func runEngine(state *LiveState, cat Catalog, rng *rand.Rand, res *model.CombatResult) {
	res.Ticks = append(res.Ticks, model.TickEvent{Tick: 0, Type: "fight_start"})

	for tick := 1; tick <= MaxTicks; tick++ {
		fired := collectFired(state)

		queue := make([]pendingEffect, 0, len(fired)*2)
		for _, it := range fired {
			res.Ticks = append(res.Ticks, model.TickEvent{
				Tick:   tick,
				Type:   "item_fired",
				Source: sourceTag(it),
			})
			if def, ok := cat.Item(it.ItemID); ok {
				for _, trig := range def.Triggers {
					if trig.Type != "cooldown" {
						continue
					}
					for _, eff := range trig.Effects {
						queue = append(queue, pendingEffect{source: it, eff: eff})
					}
					break
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
