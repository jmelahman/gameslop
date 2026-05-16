package model

import "encoding/json"

// Tier is the rarity bucket an item belongs to.
type Tier string

const (
	TierBronze  Tier = "bronze"
	TierSilver  Tier = "silver"
	TierGold    Tier = "gold"
	TierDiamond Tier = "diamond"
)

// Effect is a single effect application inside a trigger.
type Effect struct {
	Op         string `json:"op"`
	Target     string `json:"target"`
	Value      int    `json:"value,omitempty"`
	DurationMs int    `json:"duration_ms,omitempty"`
}

// Trigger fires zero or more effects under some condition.
type Trigger struct {
	Type        string   `json:"type"`
	CooldownMs  int      `json:"cooldown_ms,omitempty"`
	Effects     []Effect `json:"effects"`
}

// ItemDef is the static catalog definition for an item, loaded from JSON.
type ItemDef struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Tier             Tier            `json:"tier"`
	Size             int             `json:"size"`
	Tags             []string        `json:"tags"`
	BuyCost          int             `json:"buy_cost"`
	SellValue        int             `json:"sell_value"`
	Triggers         []Trigger       `json:"triggers"`
	Enchantable      bool            `json:"enchantable,omitempty"`
	EnchantmentSlots int             `json:"enchantment_slots,omitempty"`
	Raw              json.RawMessage `json:"-"`
}

// Enchantment is a small bundle of additional triggers that can be merged
// onto an existing ItemDef at combat-build time. Enchantments are picked
// up from a static in-code catalog (see internal/catalog/enchantments.go).
type Enchantment struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	// AppliesTo is an optional tag filter; an enchantment with `["Weapon"]`
	// can only be applied to items carrying that tag.
	AppliesTo []string  `json:"applies_to,omitempty"`
	Triggers  []Trigger `json:"triggers"`
}
