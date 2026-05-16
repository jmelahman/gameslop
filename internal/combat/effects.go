package combat

import (
	"math/rand/v2"

	"github.com/jmelahman/gameslop/internal/model"
)

// applyEffect dispatches a queued effect to the right handler. Side-scoped
// effects (damage / heal / shield / poison / burn) read Target.Side; item-
// scoped effects (haste / freeze / buff) iterate Target.Items.
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
	case "shield":
		applyShield(state, source, target, eff.Value, tick, res)
	case "poison":
		applyStatusStacks(state, source, target, "poison", eff.Value, tick, res)
	case "burn":
		applyStatusStacks(state, source, target, "burn", eff.Value, tick, res)
	case "freeze":
		applyTimedModifier(target, "freeze", 0, eff.DurationMs, tick, res, source)
	case "haste":
		// Value is a percentage; 50% haste means each tick advances the item's
		// cooldown by 1.5× the base step (so it fires 1.5× faster).
		mult := 1.0 + float64(eff.Value)/100.0
		applyTimedModifier(target, "haste", mult, eff.DurationMs, tick, res, source)
	case "gain_gold":
		emitMetaEvent(res, tick, "gain_gold", source, target, eff.Value)
	case "draw_item":
		emitMetaEvent(res, tick, "draw_item", source, target, eff.Value)
	case "buff":
		applyBuff(target, eff.Value, tick, res, source)
	}
}

// applyDamage routes value through the target side's shield first, then HP.
// Source's DamageBonus is added on top so buff stacks meaningfully scale a
// weapon's effective output. on_kill triggers fire when the hit puts the
// target side at <= 0 HP this tick (whether or not it was already dying).
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
	value += source.DamageBonus
	if target.Side == "" {
		return
	}
	hpBefore, shieldBefore := readHP(state, target.Side)
	if hpBefore <= 0 {
		// Already dead — don't pile more events onto a corpse.
		return
	}
	newShield, newHP := absorbWithShield(shieldBefore, hpBefore, value)
	writeHP(state, target.Side, newHP, newShield)
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "damage",
		Source: sourceTag(source),
		Target: string(target.Side),
		Value:  value,
	})
	if shieldBefore > 0 && newShield == 0 {
		res.Ticks = append(res.Ticks, model.TickEvent{
			Tick: tick, Type: "shield_broken", Target: string(target.Side),
		})
	}
	// on_take_damage: every item on the side that took damage queues its
	// triggers. Effects fire immediately rather than going through the main
	// queue so they observe (and can react to) the just-applied damage.
	fireOnTakeDamage(state, target.Side, tick, res)

	// on_kill: if the side dropped to ≤0 from this hit, source's on_kill
	// triggers fire (typically gain_gold).
	if hpBefore > 0 && newHP <= 0 {
		fireOnKill(state, source, tick, res)
	}
}

// applyHeal adds up to `value` HP to the target side, capped at MaxHP.
func applyHeal(
	state *LiveState,
	source *LiveItem,
	target Target,
	value, tick int,
	res *model.CombatResult,
) {
	if value <= 0 || target.Side == "" {
		return
	}
	hpBefore, shieldBefore := readHP(state, target.Side)
	maxHP := state.PlayerMaxHP
	if target.Side == model.SideOpponent {
		maxHP = state.OpponentMaxHP
	}
	room := maxHP - hpBefore
	if room <= 0 {
		return
	}
	actual := value
	if actual > room {
		actual = room
	}
	writeHP(state, target.Side, hpBefore+actual, shieldBefore)
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "heal",
		Source: sourceTag(source),
		Target: string(target.Side),
		Value:  actual,
	})
}

// applyShield adds value to the target side's shield pool. Shield has no cap
// — a build that stockpiles shields legitimately ignores damage. Emits
// shield_applied so the bubble overlay can animate.
func applyShield(
	state *LiveState,
	source *LiveItem,
	target Target,
	value, tick int,
	res *model.CombatResult,
) {
	if value <= 0 || target.Side == "" {
		return
	}
	hp, shield := readHP(state, target.Side)
	writeHP(state, target.Side, hp, shield+value)
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "shield_applied",
		Source: sourceTag(source),
		Target: string(target.Side),
		Value:  value,
	})
}

// applyStatusStacks adds `value` stacks of poison or burn to the target side.
// Stacks merge with any existing status of the same kind (timer is preserved
// so adjacent applications don't perpetually delay the first tick).
func applyStatusStacks(
	state *LiveState,
	source *LiveItem,
	target Target,
	kind string,
	value, tick int,
	res *model.CombatResult,
) {
	if value <= 0 || target.Side == "" {
		return
	}
	mergeSideStatus(state, target.Side, kind, value)
	res.Ticks = append(res.Ticks, model.TickEvent{
		Tick:   tick,
		Type:   "status_applied",
		Source: sourceTag(source),
		Target: string(target.Side),
		Value:  value,
	})
}

func mergeSideStatus(state *LiveState, side model.Side, kind string, stacks int) {
	statuses := state.PlayerStatuses
	if side == model.SideOpponent {
		statuses = state.OpponentStatuses
	}
	for i := range statuses {
		if statuses[i].Kind == kind {
			statuses[i].Stacks += stacks
			if side == model.SidePlayer {
				state.PlayerStatuses = statuses
			} else {
				state.OpponentStatuses = statuses
			}
			return
		}
	}
	statuses = append(statuses, SideStatus{Kind: kind, Stacks: stacks, RemainingMs: StatusTickMs})
	if side == model.SidePlayer {
		state.PlayerStatuses = statuses
	} else {
		state.OpponentStatuses = statuses
	}
}

// applyTimedModifier slaps a freeze / haste modifier on every item in the
// target. DurationMs <= 0 is treated as a no-op (a misconfigured item
// shouldn't throw an empty modifier on the slice forever). Each modified
// item gets its own status_applied event so the per-item icon list animates.
func applyTimedModifier(
	target Target,
	kind string,
	mult float64,
	durationMs, tick int,
	res *model.CombatResult,
	source *LiveItem,
) {
	if durationMs <= 0 || len(target.Items) == 0 {
		return
	}
	for _, it := range target.Items {
		it.Modifiers = append(it.Modifiers, TimedModifier{
			Kind: kind, Multiplier: mult, RemainingMs: durationMs,
		})
		res.Ticks = append(res.Ticks, model.TickEvent{
			Tick:   tick,
			Type:   "status_applied",
			Source: sourceTag(source),
			Target: string(it.Side) + ":" + it.ItemID,
			Value:  durationMs,
		})
	}
}

// applyBuff permanently raises DamageBonus on every targeted item. Each
// modified item emits a buff_applied event so the UI can animate the boost.
func applyBuff(
	target Target,
	value, tick int,
	res *model.CombatResult,
	source *LiveItem,
) {
	if value <= 0 || len(target.Items) == 0 {
		return
	}
	for _, it := range target.Items {
		it.DamageBonus += value
		res.Ticks = append(res.Ticks, model.TickEvent{
			Tick:   tick,
			Type:   "buff_applied",
			Source: sourceTag(source),
			Target: string(it.Side) + ":" + it.ItemID,
			Value:  value,
		})
	}
}

// emitMetaEvent records gain_gold / draw_item events. These have no in-fight
// state effect but the frontend renders them so the player sees what their
// kill / fight-end triggers earned them post-combat.
func emitMetaEvent(res *model.CombatResult, tick int, kind string, source *LiveItem, target Target, value int) {
	ev := model.TickEvent{
		Tick:   tick,
		Type:   kind,
		Source: sourceTag(source),
		Value:  value,
	}
	if target.Side != "" {
		ev.Target = string(target.Side)
	}
	res.Ticks = append(res.Ticks, ev)
}

// fireOnTakeDamage queues every item-on-the-hurt-side's on_take_damage trigger
// effects and applies them in slot order. We don't recursively re-fire on
// chained damage to avoid infinite loops — the trigger sees the original hit
// and is allowed to resolve once per damage event.
func fireOnTakeDamage(state *LiveState, side model.Side, tick int, res *model.CombatResult) {
	pool := state.PlayerItems
	if side == model.SideOpponent {
		pool = state.OpponentItems
	}
	for _, it := range pool {
		for _, trig := range it.Triggers {
			if trig.Type != "on_take_damage" {
				continue
			}
			for _, eff := range trig.Effects {
				applyTakeDamageEffect(state, it, eff, tick, res)
			}
		}
	}
}

// applyTakeDamageEffect is a deliberately narrow handler used by
// on_take_damage triggers — only non-damage effects (shield, heal, status
// applies, buff, freeze, haste) fire so a chain of poison/burn doesn't
// recursively re-trigger the same set of items every tick.
func applyTakeDamageEffect(
	state *LiveState,
	source *LiveItem,
	eff model.Effect,
	tick int,
	res *model.CombatResult,
) {
	target, ok := SelectTarget(eff.Target, state, source, nil)
	if !ok {
		return
	}
	switch eff.Op {
	case "heal":
		applyHeal(state, source, target, eff.Value, tick, res)
	case "shield":
		applyShield(state, source, target, eff.Value, tick, res)
	case "haste":
		mult := 1.0 + float64(eff.Value)/100.0
		applyTimedModifier(target, "haste", mult, eff.DurationMs, tick, res, source)
	case "buff":
		applyBuff(target, eff.Value, tick, res, source)
	case "freeze":
		applyTimedModifier(target, "freeze", 0, eff.DurationMs, tick, res, source)
	case "gain_gold", "draw_item":
		emitMetaEvent(res, tick, eff.Op, source, target, eff.Value)
	}
}

// fireOnKill walks the source item's on_kill triggers. The damage handler
// invokes this when its hit drops the target side to <= 0 HP.
func fireOnKill(state *LiveState, source *LiveItem, tick int, res *model.CombatResult) {
	for _, trig := range source.Triggers {
		if trig.Type != "on_kill" {
			continue
		}
		for _, eff := range trig.Effects {
			target, ok := SelectTarget(eff.Target, state, source, nil)
			if !ok {
				continue
			}
			switch eff.Op {
			case "gain_gold", "draw_item":
				emitMetaEvent(res, tick, eff.Op, source, target, eff.Value)
			case "heal":
				applyHeal(state, source, target, eff.Value, tick, res)
			case "shield":
				applyShield(state, source, target, eff.Value, tick, res)
			case "buff":
				applyBuff(target, eff.Value, tick, res, source)
			}
		}
	}
}
