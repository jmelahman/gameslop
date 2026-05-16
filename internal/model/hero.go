package model

import "encoding/json"

// HeroDef is the static catalog definition for a playable hero.
type HeroDef struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	StartingHP  int             `json:"starting_hp"`
	Raw         json.RawMessage `json:"-"`
}
