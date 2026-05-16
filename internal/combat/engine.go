// Package combat owns the deterministic fight simulator. It must not import
// internal/store or internal/db — Simulate is a pure function from board +
// opponent + seed to a tick log so it can be replayed, table-tested, and
// (later) ghost-replayed for PvP. Phase 5 ships a trivial one-tick-per-item
// implementation; Phase 7+ deepens it.
package combat

import "github.com/jmelahman/gameslop/internal/model"

// Catalog is the minimal read-only item lookup the simulator needs. It is
// satisfied by *catalog.Catalog without an import-cycle on that package.
type Catalog interface {
	Item(id string) (model.ItemDef, bool)
}

// firstCooldownDamage extracts the single damage value an item deals in the
// trivial Phase-5 model: walk its triggers, return the first damage effect
// found under a cooldown trigger. Zero means "this item deals no damage".
func firstCooldownDamage(def model.ItemDef) int {
	for _, trig := range def.Triggers {
		if trig.Type != "cooldown" {
			continue
		}
		for _, eff := range trig.Effects {
			if eff.Op == "damage" {
				return eff.Value
			}
		}
	}
	return 0
}

// outcomeFor determines the high-level result from the post-fight HP totals.
// Both sides at or below zero is a tie (Phase 5 — refined later when HP
// shielding lands).
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
		// Neither side died (e.g. both boards lack damaging items). Treat as
		// a tie so the day still advances without rewarding either side.
		return model.CombatOutcomeTie
	}
}
