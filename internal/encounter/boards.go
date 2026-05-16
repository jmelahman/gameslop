// Package encounter owns the generation of AI opponent setups for each day
// in a run. Phase 5 ships a tiny pre-authored pool keyed by day; procedural
// generation arrives later. The package is pure (no DB), so it is trivially
// testable.
package encounter

import "github.com/jmelahman/gameslop/internal/model"

// Board is one self-contained opponent setup: their starting HP plus the
// items on their board (item ids reference the static item_catalog).
type Board struct {
	HP    int               `json:"hp"`
	Items []model.BoardItem `json:"items"`
}

// pools maps a day index to a list of candidate boards. Day 1 is the only
// fully-authored day in Phase 5; later days fall back to a default pool until
// procedural generation arrives in Phase 11.
var pools = map[int][]Board{
	1: {
		{
			HP: 5,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
			},
		},
	},
}

// defaultPool is used when no day-specific entry exists. Each later day gets
// a slightly harder canned board until proper generation lands.
var defaultPool = []Board{
	{
		HP: 40,
		Items: []model.BoardItem{
			{ItemID: "rusty_sword", Slot: 0},
			{ItemID: "iron_dagger", Slot: 1},
		},
	},
	{
		HP: 50,
		Items: []model.BoardItem{
			{ItemID: "iron_dagger", Slot: 0},
			{ItemID: "wooden_shield", Slot: 1},
			{ItemID: "rusty_sword", Slot: 2},
		},
	},
}

// boardsForDay returns the candidate pool for the given day, falling back to
// defaultPool when the day has no bespoke entry.
func boardsForDay(day int) []Board {
	if p, ok := pools[day]; ok && len(p) > 0 {
		return p
	}
	return defaultPool
}
