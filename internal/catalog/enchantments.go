package catalog

import "github.com/jmelahman/gameslop/internal/model"

// enchantments is the static in-code catalog of enchantments. We keep it in
// Go (not JSON) because the list is small and tightly coupled to the
// trigger / effect schema — adding a new enchantment is two lines here.
var enchantments = map[string]model.Enchantment{
	"fiery": {
		ID:          "fiery",
		Name:        "Fiery",
		Description: "Adds a 1500ms cooldown that burns the opponent for 2 stacks.",
		AppliesTo:   []string{"Weapon"},
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: 1500,
				Effects: []model.Effect{
					{Op: "burn", Target: "opponent_random", Value: 2},
				},
			},
		},
	},
	"toxic": {
		ID:          "toxic",
		Name:        "Toxic",
		Description: "Adds a 2000ms cooldown that poisons the opponent for 2 stacks.",
		AppliesTo:   []string{"Weapon"},
		Triggers: []model.Trigger{
			{
				Type:       "cooldown",
				CooldownMs: 2000,
				Effects: []model.Effect{
					{Op: "poison", Target: "opponent_random", Value: 2},
				},
			},
		},
	},
	"hasty": {
		ID:          "hasty",
		Name:        "Hasty",
		Description: "Hastes itself by 50% for 2000ms when combat starts.",
		Triggers: []model.Trigger{
			{
				Type: "at_fight_start",
				Effects: []model.Effect{
					{Op: "haste", Target: "self_item", Value: 50, DurationMs: 2000},
				},
			},
		},
	},
	"shielded": {
		ID:          "shielded",
		Name:        "Shielded",
		Description: "Grants 5 shield to the owner at fight start.",
		Triggers: []model.Trigger{
			{
				Type: "at_fight_start",
				Effects: []model.Effect{
					{Op: "shield", Target: "self_player", Value: 5},
				},
			},
		},
	},
}

// Enchantment looks up a single enchantment by id.
func (c *Catalog) Enchantment(id string) (model.Enchantment, bool) {
	e, ok := enchantments[id]
	return e, ok
}

// AllEnchantments returns a snapshot of every enchantment, ordered by id for
// stable iteration (so the wire response is deterministic).
func (c *Catalog) AllEnchantments() []model.Enchantment {
	out := make([]model.Enchantment, 0, len(enchantments))
	for _, e := range enchantments {
		out = append(out, e)
	}
	return out
}
