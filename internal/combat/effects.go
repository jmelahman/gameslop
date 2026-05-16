package combat

import (
	"math/rand/v2"

	"github.com/jmelahman/gameslop/internal/model"
)

// applyEffect dispatches a queued effect to the right handler. Phase 7 only
// covers damage and heal; shield / poison / burn / haste / etc. land in
// phase 11 and are silently ignored for now (the item_fired event was already
// emitted, so the playback timeline still shows the item activating).
func applyEffect(
	state *LiveState,
	source *LiveItem,
	eff model.Effect,
	rng *rand.Rand,
	tick int,
	res *model.CombatResult,
) {
	target, ok := SelectTarget(eff.Target, state, source, rng)
	if !ok {
		return
	}
	switch eff.Op {
	case "damage":
		applyDamage(state, source, target, eff.Value, tick, res)
	case "heal":
		applyHeal(state, source, target, eff.Value, tick, res)
	}
}

// applyDamage subtracts value HP from the side identified by target and
// records a damage event. Negative / zero values are no-ops.
func applyDamage(
	state *LiveState,
	source *LiveItem,
	target Target,
	value, tick int,
	res *model.CombatResult,
) {
	if value <= 0 {
		return
	}
	switch target.Side {
	case model.SidePlayer:
		state.PlayerHP -= value
	case model.SideOpponent:
		state.OpponentHP -= value
	default:
		return
	}
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "damage",
		Source: sourceTag(source),
		Target: string(target.Side),
		Value:  value,
	})
}

// applyHeal adds up to `value` HP to the target side, capped at its starting
// HP so heals can't push HP above the fight's opening total. The emitted
// event records the actual amount restored so the client can render an
// accurate health bar tween without re-deriving caps.
func applyHeal(
	state *LiveState,
	source *LiveItem,
	target Target,
	value, tick int,
	res *model.CombatResult,
) {
	if value <= 0 {
		return
	}
	var actual int
	switch target.Side {
	case model.SidePlayer:
		room := state.PlayerMaxHP - state.PlayerHP
		if room <= 0 {
			return
		}
		actual = value
		if actual > room {
			actual = room
		}
		state.PlayerHP += actual
	case model.SideOpponent:
		room := state.OpponentMaxHP - state.OpponentHP
		if room <= 0 {
			return
		}
		actual = value
		if actual > room {
			actual = room
		}
		state.OpponentHP += actual
	default:
		return
	}
	if actual <= 0 {
		return
	}
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "heal",
		Source: sourceTag(source),
		Target: string(target.Side),
		Value:  actual,
	})
}
