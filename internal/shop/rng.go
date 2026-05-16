package shop

import (
	"math/rand/v2"
)

// dayMix and rollMix are arbitrary odd 64-bit primes used to spread a single
// shop_seed across (day, refresh_index) so the same seed produces different
// sequences for each combination.
const (
	dayMix  uint64 = 0x9e3779b97f4a7c15
	rollMix uint64 = 0xbf58476d1ce4e5b9
)

// newRand returns a deterministic PCG random source mixed from the run's
// shop_seed, the current day, and the refresh counter. Sub-seeds are derived
// by xoring with multiplicative constants so distinct (day, rolls) pairs do
// not collide.
func newRand(seed int64, day, rolls int) *rand.Rand {
	a := uint64(seed) ^ (uint64(day) * dayMix)
	b := uint64(seed) ^ (uint64(rolls+1) * rollMix)
	return rand.New(rand.NewPCG(a, b))
}

// pickWeighted returns the index in weights selected proportionally to its
// value. Caller guarantees sum > 0.
func pickWeighted(r *rand.Rand, weights []int) int {
	total := 0
	for _, w := range weights {
		total += w
	}
	if total <= 0 {
		return 0
	}
	pick := r.IntN(total)
	for i, w := range weights {
		if pick < w {
			return i
		}
		pick -= w
	}
	return len(weights) - 1
}
