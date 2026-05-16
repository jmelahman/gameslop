package model

// CombatOutcome is the high-level result of a fight.
type CombatOutcome string

const (
	CombatOutcomeWin  CombatOutcome = "win"
	CombatOutcomeLoss CombatOutcome = "loss"
	CombatOutcomeTie  CombatOutcome = "tie"
)

// TickEvent is a single observable event in the deterministic tick log.
type TickEvent struct {
	Tick   int    `json:"tick"`
	Type   string `json:"type"`
	Source string `json:"source,omitempty"`
	Target string `json:"target,omitempty"`
	Value  int    `json:"value,omitempty"`
}

// CombatResult is the artifact returned by Simulate(). Stubbed for Phase 2.
type CombatResult struct {
	Seed    int64         `json:"seed"`
	Outcome CombatOutcome `json:"outcome"`
	Ticks   []TickEvent   `json:"ticks"`
}
