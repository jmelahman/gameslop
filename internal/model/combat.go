package model

// CombatOutcome is the high-level result of a fight.
type CombatOutcome string

const (
	CombatOutcomeWin  CombatOutcome = "win"
	CombatOutcomeLoss CombatOutcome = "loss"
	CombatOutcomeTie  CombatOutcome = "tie"
)

// Side identifies which combatant an event targets or originates from.
type Side string

const (
	SidePlayer   Side = "player"
	SideOpponent Side = "opponent"
)

// TickEvent is a single observable event in the deterministic tick log.
// Source / Target are either "player" / "opponent" or an item_id depending on
// the event type.
type TickEvent struct {
	Tick   int    `json:"tick"`
	Type   string `json:"type"`
	Source string `json:"source,omitempty"`
	Target string `json:"target,omitempty"`
	Value  int    `json:"value,omitempty"`
}

// CombatResult is the deterministic artifact produced by Simulate. The HP
// snapshots let the frontend render starting / ending bars without replaying
// the event stream itself, while Ticks still drives playback animation.
// PlayerBoard and OpponentBoard are populated by the caller (the simulator
// itself doesn't need them) so the persisted combat log is self-contained
// for replay even after the run state mutates.
type CombatResult struct {
	Seed            int64         `json:"seed"`
	Outcome         CombatOutcome `json:"outcome"`
	PlayerStartHP   int           `json:"player_start_hp"`
	OpponentStartHP int           `json:"opponent_start_hp"`
	PlayerEndHP     int           `json:"player_end_hp"`
	OpponentEndHP   int           `json:"opponent_end_hp"`
	PlayerBoard     []BoardItem   `json:"player_board,omitempty"`
	OpponentBoard   []BoardItem   `json:"opponent_board,omitempty"`
	Ticks           []TickEvent   `json:"ticks"`
}
