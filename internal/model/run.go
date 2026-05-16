package model

// RunStatus is the lifecycle state of a run.
type RunStatus string

const (
	RunStatusActive    RunStatus = "active"
	RunStatusWon       RunStatus = "won"
	RunStatusLost      RunStatus = "lost"
	RunStatusAbandoned RunStatus = "abandoned"
)

// Run is the persistent row in the runs table.
type Run struct {
	ID        int64     `json:"id"`
	PlayerID  int64     `json:"player_id"`
	HeroID    string    `json:"hero_id"`
	Status    RunStatus `json:"status"`
	ShopSeed  int64     `json:"shop_seed"`
	StartedAt int64     `json:"started_at"`
	EndedAt   *int64    `json:"ended_at,omitempty"`
}

// BoardItem is an item placed on the player's board (or bench) during a run.
type BoardItem struct {
	ItemID string `json:"item_id"`
	Slot   int    `json:"slot"`
}

// ShopItem is a slot in the current shop offering.
type ShopItem struct {
	ItemID string `json:"item_id"`
	Frozen bool   `json:"frozen"`
}

// RunState holds the mutable per-run progression columns.
type RunState struct {
	RunID     int64       `json:"run_id"`
	Day       int         `json:"day"`
	Gold      int         `json:"gold"`
	HP        int         `json:"hp"`
	ShopLevel int         `json:"shop_level"`
	XP        int         `json:"xp"`
	ShopRolls int         `json:"shop_rolls"`
	Shop      []ShopItem  `json:"shop"`
	Hand      []BoardItem `json:"hand"`
	Board     []BoardItem `json:"board"`
	UpdatedAt int64       `json:"updated_at"`
}

// ActiveRun bundles the persistent run row with its mutable state for API
// responses.
type ActiveRun struct {
	Run   Run      `json:"run"`
	State RunState `json:"state"`
}
