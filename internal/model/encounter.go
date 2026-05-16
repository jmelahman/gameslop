package model

// EncounterStatus is the lifecycle of a single day's encounter.
type EncounterStatus string

const (
	EncounterPending  EncounterStatus = "pending"
	EncounterResolved EncounterStatus = "resolved"
)

// Encounter is the opponent setup + result for one day in a run.
type Encounter struct {
	ID            int64           `json:"id"`
	RunID         int64           `json:"run_id"`
	Day           int             `json:"day"`
	OpponentBoard []BoardItem     `json:"opponent_board"`
	Seed          int64           `json:"seed"`
	Status        EncounterStatus `json:"status"`
	CombatLog     []byte          `json:"-"`
}
