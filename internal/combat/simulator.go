package combat

import (
	"math/rand/v2"

	"github.com/jmelahman/gameslop/internal/model"
)

// Simulate runs a deterministic fight between playerBoard and opponentBoard.
// Same inputs (boards, starting HP, seed) always yield a byte-identical tick
// log so the same encounter can be replayed indefinitely and compared in
// table tests.
//
// The simulator is pure: it does not read the database, the wall clock, or
// any global RNG. The caller decides starting HP totals; the engine drives
// the rest from the catalog data attached to each item id.
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
	// math/rand/v2 ChaCha8 needs a 32-byte seed; expand the int64 with a
	// splitmix-style hash so adjacent seeds produce well-spread streams.
	rng := rand.New(rand.NewChaCha8(expandSeed(seed)))

	state := &LiveState{
		PlayerHP:      playerHP,
		PlayerMaxHP:   playerHP,
		OpponentHP:    opponentHP,
		OpponentMaxHP: opponentHP,
		PlayerItems:   buildLiveItems(playerBoard, model.SidePlayer, cat),
		OpponentItems: buildLiveItems(opponentBoard, model.SideOpponent, cat),
	}

	runEngine(state, cat, rng, res)
	return res
}

// expandSeed scatters an int64 seed across 32 bytes via a splitmix64
// progression. Identical inputs produce identical byte sequences, which is
// what the determinism guarantee rests on.
func expandSeed(seed int64) [32]byte {
	var out [32]byte
	z := uint64(seed)
	for i := 0; i < 4; i++ {
		z += 0x9e3779b97f4a7c15
		x := z
		x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
		x = (x ^ (x >> 27)) * 0x94d049bb133111eb
		x = x ^ (x >> 31)
		base := i * 8
		out[base+0] = byte(x)
		out[base+1] = byte(x >> 8)
		out[base+2] = byte(x >> 16)
		out[base+3] = byte(x >> 24)
		out[base+4] = byte(x >> 32)
		out[base+5] = byte(x >> 40)
		out[base+6] = byte(x >> 48)
		out[base+7] = byte(x >> 56)
	}
	return out
}
