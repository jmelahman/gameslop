package encounter

// Generate picks a deterministic opponent Board for the given day from the
// pool, using `seed` to make the choice. The same (day, seed) pair always
// returns the same board so combat replays are reproducible.
func Generate(day int, seed int64) Board {
	pool := boardsForDay(day)
	idx := int(uint64(seed)%uint64(len(pool)))
	return pool[idx]
}
