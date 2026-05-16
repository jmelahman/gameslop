package art

import (
	"strings"
	"testing"

	"github.com/jmelahman/gameslop/internal/model"
)

func TestBuildPromptIncludesNameTagsAndStyle(t *testing.T) {
	got := BuildPrompt(model.ItemDef{
		ID:   "sword_of_haste",
		Name: "Sword of Haste",
		Tags: []string{"Weapon", "Trinket"},
	})
	for _, want := range []string{"fantasy game item icon", "Sword of Haste", "weapon trinket", StyleSuffix} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt missing %q: %s", want, got)
		}
	}
}

func TestBuildPromptDeterministic(t *testing.T) {
	item := model.ItemDef{ID: "x", Name: "X", Tags: []string{"A"}}
	if BuildPrompt(item) != BuildPrompt(item) {
		t.Fatal("BuildPrompt should be deterministic")
	}
}

func TestSeedForDeterministicAndItemSpecific(t *testing.T) {
	if SeedFor("rusty_sword", "") != SeedFor("rusty_sword", "") {
		t.Fatal("seed not stable across calls")
	}
	if SeedFor("rusty_sword", "") == SeedFor("wooden_shield", "") {
		t.Fatal("different items produced the same seed")
	}
	if SeedFor("rusty_sword", "") < 0 {
		t.Fatal("seed should be non-negative")
	}
}

func TestSeedForNonceProducesDifferentSeed(t *testing.T) {
	base := SeedFor("rusty_sword", "")
	rerolled := SeedFor("rusty_sword", "nonce-1")
	if base == rerolled {
		t.Fatal("reroll nonce did not change seed")
	}
	if rerolled != SeedFor("rusty_sword", "nonce-1") {
		t.Fatal("same nonce produced different seeds across calls")
	}
}
