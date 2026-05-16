// Package encounter owns the generation of AI opponent setups for each day
// in a run. Phase 7 ships pre-authored pools for days 1–3 (a gentle ramp
// that introduces one new combat dynamic per day); later days fall back to
// the default pool until procedural generation arrives in phase 11. The
// package is pure (no DB), so it is trivially testable.
package encounter

import "github.com/jmelahman/gameslop/internal/model"

// Board is one self-contained opponent setup: their starting HP plus the
// items on their board (item ids reference the static item_catalog).
type Board struct {
	HP    int               `json:"hp"`
	Items []model.BoardItem `json:"items"`
}

// pools maps a day index to a list of candidate boards. Days 1–10 are hand
// authored so the difficulty ramp is predictable end-to-end: HP and item
// count both scale roughly linearly. Each day has a small pool so seeded
// reruns can produce slightly different fights; later phases will replace
// this with procedural generation (plan: phase 11).
var pools = map[int][]Board{
	1: {
		{
			HP: 18,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
			},
		},
	},
	2: {
		{
			HP: 28,
			Items: []model.BoardItem{
				{ItemID: "iron_dagger", Slot: 0},
				{ItemID: "rusty_sword", Slot: 1},
			},
		},
	},
	3: {
		{
			HP: 36,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "iron_dagger", Slot: 1},
				{ItemID: "healing_potion", Slot: 2},
			},
		},
	},
	4: {
		{
			HP: 50,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "iron_dagger", Slot: 1},
				{ItemID: "wooden_shield", Slot: 2},
			},
		},
		{
			HP: 48,
			Items: []model.BoardItem{
				{ItemID: "iron_dagger", Slot: 0},
				{ItemID: "iron_dagger", Slot: 1},
				{ItemID: "healing_potion", Slot: 2},
			},
		},
	},
	5: {
		{
			HP: 62,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "rusty_sword", Slot: 1},
				{ItemID: "iron_dagger", Slot: 2},
				{ItemID: "wooden_shield", Slot: 3},
			},
		},
	},
	6: {
		{
			HP: 74,
			Items: []model.BoardItem{
				{ItemID: "iron_dagger", Slot: 0},
				{ItemID: "iron_dagger", Slot: 1},
				{ItemID: "rusty_sword", Slot: 2},
				{ItemID: "healing_potion", Slot: 3},
			},
		},
		{
			HP: 78,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "rusty_sword", Slot: 1},
				{ItemID: "wooden_shield", Slot: 2},
				{ItemID: "wooden_shield", Slot: 3},
			},
		},
	},
	7: {
		{
			HP: 90,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "rusty_sword", Slot: 1},
				{ItemID: "iron_dagger", Slot: 2},
				{ItemID: "iron_dagger", Slot: 3},
				{ItemID: "healing_potion", Slot: 4},
			},
		},
	},
	8: {
		{
			HP: 105,
			Items: []model.BoardItem{
				{ItemID: "iron_dagger", Slot: 0},
				{ItemID: "iron_dagger", Slot: 1},
				{ItemID: "rusty_sword", Slot: 2},
				{ItemID: "rusty_sword", Slot: 3},
				{ItemID: "wooden_shield", Slot: 4},
			},
		},
	},
	9: {
		{
			HP: 120,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "rusty_sword", Slot: 1},
				{ItemID: "iron_dagger", Slot: 2},
				{ItemID: "iron_dagger", Slot: 3},
				{ItemID: "wooden_shield", Slot: 4},
				{ItemID: "healing_potion", Slot: 5},
			},
		},
	},
	10: {
		{
			HP: 150,
			Items: []model.BoardItem{
				{ItemID: "rusty_sword", Slot: 0},
				{ItemID: "rusty_sword", Slot: 1},
				{ItemID: "iron_dagger", Slot: 2},
				{ItemID: "iron_dagger", Slot: 3},
				{ItemID: "wooden_shield", Slot: 4},
				{ItemID: "wooden_shield", Slot: 5},
				{ItemID: "healing_potion", Slot: 6},
			},
		},
	},
}

// defaultPool is used when no day-specific entry exists. Each entry should
// be roughly day-4-or-later strength; Generate picks deterministically by
// seed so a given (day, seed) replay is stable.
var defaultPool = []Board{
	{
		HP: 45,
		Items: []model.BoardItem{
			{ItemID: "rusty_sword", Slot: 0},
			{ItemID: "rusty_sword", Slot: 1},
			{ItemID: "iron_dagger", Slot: 2},
		},
	},
	{
		HP: 55,
		Items: []model.BoardItem{
			{ItemID: "iron_dagger", Slot: 0},
			{ItemID: "iron_dagger", Slot: 1},
			{ItemID: "rusty_sword", Slot: 2},
			{ItemID: "healing_potion", Slot: 3},
		},
	},
	{
		HP: 70,
		Items: []model.BoardItem{
			{ItemID: "rusty_sword", Slot: 0},
			{ItemID: "rusty_sword", Slot: 1},
			{ItemID: "iron_dagger", Slot: 2},
			{ItemID: "iron_dagger", Slot: 3},
			{ItemID: "healing_potion", Slot: 4},
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
