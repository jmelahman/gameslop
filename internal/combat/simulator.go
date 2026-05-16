package combat

import (
	"sort"

	"github.com/jmelahman/gameslop/internal/model"
)

// Simulate runs a deterministic fight between playerBoard and opponentBoard.
//
// Phase 5 contract: each item fires exactly once at fight start. Player items
// fire first, then opponent items, in slot order. Each item's first cooldown
// trigger's first damage effect lands on the opposite side. HP is reduced in
// order; once a side hits 0 it can still take damage from queued events in
// the same tick (the outcome is computed from final totals). The tick log is
// one event per moment of interest so the client can pace playback at 100 ms.
//
// seed is currently unused — included so the signature is stable when later
// phases add randomized targeting / RNG-driven effects.
func Simulate(
	playerBoard, opponentBoard []model.BoardItem,
	playerHP, opponentHP int,
	seed int64,
	cat Catalog,
) *model.CombatResult {
	res := &model.CombatResult{
		Seed:            seed,
		PlayerStartHP:   playerHP,
		OpponentStartHP: opponentHP,
		Ticks:           []model.TickEvent{},
	}

	player := sortedBySlot(playerBoard)
	opponent := sortedBySlot(opponentBoard)

	tick := 0
	res.Ticks = append(res.Ticks, model.TickEvent{Tick: tick, Type: "fight_start"})

	playerCur := playerHP
	opponentCur := opponentHP

	// Interleave player / opponent items so the playback feels like a back-and-
	// forth exchange. Each item gets its own tick (item_fired + optional damage)
	// so the 100ms-per-tick playback reads as a sequence of distinct beats.
	maxLen := len(player)
	if len(opponent) > maxLen {
		maxLen = len(opponent)
	}
	for i := 0; i < maxLen; i++ {
		if i < len(player) {
			tick++
			fireItem(res, cat, player[i], model.SidePlayer, model.SideOpponent, &opponentCur, tick)
		}
		if i < len(opponent) {
			tick++
			fireItem(res, cat, opponent[i], model.SideOpponent, model.SidePlayer, &playerCur, tick)
		}
	}

	res.PlayerEndHP = playerCur
	res.OpponentEndHP = opponentCur
	res.Outcome = outcomeFor(playerCur, opponentCur)

	tick++
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick: tick,
		Type: "fight_end",
	})

	return res
}

// fireItem emits the (item_fired, damage) event pair for a single item and
// decrements the target's HP in place. Items with no damaging cooldown
// trigger still emit item_fired so the client can show "X activates" for
// shields and heals later — for Phase 5 they simply do nothing else.
func fireItem(
	res *model.CombatResult,
	cat Catalog,
	bi model.BoardItem,
	source, target model.Side,
	targetHP *int,
	tick int,
) {
	def, ok := cat.Item(bi.ItemID)
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "item_fired",
		Source: string(source) + ":" + bi.ItemID,
	})
	if !ok {
		return
	}
	dmg := firstCooldownDamage(def)
	if dmg <= 0 {
		return
	}
	*targetHP -= dmg
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "damage",
		Source: string(source) + ":" + bi.ItemID,
		Target: string(target),
		Value:  dmg,
	})
}

// sortedBySlot returns a copy of items sorted ascending by slot so iteration
// order is deterministic regardless of how they were stored.
func sortedBySlot(items []model.BoardItem) []model.BoardItem {
	out := make([]model.BoardItem, len(items))
	copy(out, items)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Slot < out[j].Slot })
	return out
}
