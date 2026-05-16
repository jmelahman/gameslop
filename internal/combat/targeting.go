package combat

import (
	"math/rand/v2"

	"github.com/jmelahman/gameslop/internal/model"
)

// Target identifies what an effect lands on. Side names a combatant for HP-
// scoped effects (damage, heal, shield, poison, burn). Items names individual
// LiveItems for item-scoped effects (haste, freeze, buff). Both can be set —
// e.g. self_player has Side but no Items, self_item has Items but no Side.
type Target struct {
	Side  model.Side
	Items []*LiveItem
}

// SelectTarget resolves a targeting mode to a concrete Target. The rng is
// only consumed by modes that need to pick from multiple candidates.
//
// Returns ok=false when the mode is unknown or no candidate exists — the
// caller treats that as a silent no-op.
func SelectTarget(
	mode string,
	state *LiveState,
	origin *LiveItem,
	rng *rand.Rand,
) (Target, bool) {
	switch mode {
	case "opponent_random":
		return Target{Side: opposingSide(origin.Side)}, true
	case "opponent_all":
		return Target{
			Side:  opposingSide(origin.Side),
			Items: itemsOnSide(state, opposingSide(origin.Side)),
		}, true
	case "opponent_front":
		side := opposingSide(origin.Side)
		items := itemsOnSide(state, side)
		if len(items) == 0 {
			return Target{Side: side}, true
		}
		return Target{Side: side, Items: items[:1]}, true
	case "self_player":
		return Target{Side: origin.Side}, true
	case "self_item":
		return Target{Items: []*LiveItem{origin}}, true
	case "self_adjacent":
		return Target{Items: adjacentItems(state, origin)}, true
	case "self_all_weapons":
		return Target{Items: itemsOnSideTagged(state, origin.Side, "Weapon")}, true
	default:
		return Target{}, false
	}
}

// itemsOnSide returns a fresh slice in slot order so handlers can iterate
// without worrying about engine internals mutating it mid-loop.
func itemsOnSide(state *LiveState, side model.Side) []*LiveItem {
	src := state.OpponentItems
	if side == model.SidePlayer {
		src = state.PlayerItems
	}
	out := make([]*LiveItem, len(src))
	copy(out, src)
	return out
}

// itemsOnSideTagged returns the in-slot-order items on the given side that
// carry the given tag.
func itemsOnSideTagged(state *LiveState, side model.Side, tag string) []*LiveItem {
	src := state.OpponentItems
	if side == model.SidePlayer {
		src = state.PlayerItems
	}
	out := []*LiveItem{}
	for _, it := range src {
		for _, t := range it.Tags {
			if t == tag {
				out = append(out, it)
				break
			}
		}
	}
	return out
}

// opposingSide flips player ↔ opponent.
func opposingSide(s model.Side) model.Side {
	if s == model.SidePlayer {
		return model.SideOpponent
	}
	return model.SidePlayer
}
