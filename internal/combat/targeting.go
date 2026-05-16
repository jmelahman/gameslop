package combat

import (
	"math/rand/v2"

	"github.com/jmelahman/gameslop/internal/model"
)

// Target identifies what an effect lands on. Phase 7 only targets players
// (an entire side). Phase 11 will extend this struct to support per-item
// targets (a slot on the opposing board, for example).
type Target struct {
	Side model.Side
}

// SelectTarget resolves a targeting mode to a concrete Target. The rng is
// threaded through so future random selectors stay deterministic; phase 7
// modes (`opponent_random`, `self_player`) have a single candidate so they
// don't consume any rng calls.
//
// Returns ok=false when the mode is unknown — the caller treats that as a
// silent no-op (the item_fired event still landed in the tick log).
func SelectTarget(
	mode string,
	state *LiveState,
	origin *LiveItem,
	rng *rand.Rand,
) (Target, bool) {
	_ = state
	_ = rng
	switch mode {
	case "opponent_random":
		return Target{Side: opposingSide(origin.Side)}, true
	case "self_player":
		return Target{Side: origin.Side}, true
	default:
		return Target{}, false
	}
}

// opposingSide flips player ↔ opponent.
func opposingSide(s model.Side) model.Side {
	if s == model.SidePlayer {
		return model.SideOpponent
	}
	return model.SidePlayer
}
