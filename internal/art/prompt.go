// Package art generates item icon art via a local ComfyUI server running
// Flux Schnell. Prompt assembly and seed derivation live here; the HTTP
// client lives in client.go and the Flux workflow lives in workflow.go.
package art

import (
	"crypto/sha256"
	"encoding/binary"
	"strings"

	"github.com/jmelahman/gameslop/internal/model"
)

// StyleSuffix is appended to every per-item prompt so the entire catalog
// shares a coherent visual style. Flux responds best to descriptive
// natural-language phrases rather than keyword tags. Changing this string
// will desync any already-generated art — bump prompts intentionally.
const StyleSuffix = "rendered as a highly detailed painted illustration with " +
	"dramatic rim lighting, centered on a dark neutral background, " +
	"intricate ornate details, single object, game asset concept art, " +
	"masterpiece quality"

// BuildPrompt composes the positive prompt for one item: a fixed lead-in,
// the item name, its tags lower-cased, then the global style suffix. Output
// is deterministic given the same item, so re-runs produce the same prompt.
func BuildPrompt(item model.ItemDef) string {
	parts := []string{"fantasy game item icon", item.Name}
	if len(item.Tags) > 0 {
		lowered := make([]string, len(item.Tags))
		for i, t := range item.Tags {
			lowered[i] = strings.ToLower(t)
		}
		parts = append(parts, strings.Join(lowered, " "))
	}
	parts = append(parts, StyleSuffix)
	return strings.Join(parts, ", ")
}

// SeedFor derives a deterministic int64 seed from an item ID. When nonce is
// non-empty it is mixed into the hash, so callers can reroll an item with a
// fresh nonce while still being reproducible across a single batch.
func SeedFor(itemID, nonce string) int64 {
	h := sha256.New()
	h.Write([]byte(itemID))
	if nonce != "" {
		h.Write([]byte{0})
		h.Write([]byte(nonce))
	}
	sum := h.Sum(nil)
	// Mask off the sign bit — seeds are stored as int64 in our DB but
	// downstream consumers expect non-negative values.
	return int64(binary.BigEndian.Uint64(sum[:8]) & 0x7fffffffffffffff)
}
