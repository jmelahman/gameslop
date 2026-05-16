// Per-fight stats derived from a combat tick log. Kept in lib/combat so the
// React-free reducer + sequencer can sit beside it (and so the unit tests
// for stat aggregation never need a DOM).
//
// All values are scoped to the fight the tick log came from; aggregate
// per-run stats are surfaced separately by walking encounter history.

import type { TickEvent } from "@/types/game";

export type FightStats = {
  /** Total HP-damage the player's items dealt to the opponent (post-shield). */
  damageDealt: number;
  /** Total HP-damage the player took (post-shield). */
  damageTaken: number;
  /** Total HP-healed back to the player. */
  healed: number;
  /** Total shield value the player applied across the fight. */
  shieldApplied: number;
  /** Count of distinct player items that ever fired. */
  itemsUsed: number;
  /** Total number of player item fires (counts each cooldown trigger). */
  itemFires: number;
};

const EMPTY: FightStats = {
  damageDealt: 0,
  damageTaken: 0,
  healed: 0,
  shieldApplied: 0,
  itemsUsed: 0,
  itemFires: 0,
};

// summarizeFight walks a tick log once and computes player-facing totals.
// Source tags are formatted "side:item_id" (see engine.sourceTag), and HP
// targets are bare "player"/"opponent" sides.
export function summarizeFight(ticks: TickEvent[]): FightStats {
  if (ticks.length === 0) return EMPTY;
  const playerItemFires = new Set<string>();
  let damageDealt = 0;
  let damageTaken = 0;
  let healed = 0;
  let shieldApplied = 0;
  let itemFires = 0;

  for (const ev of ticks) {
    switch (ev.type) {
      case "item_fired": {
        if (!ev.source) break;
        if (ev.source.startsWith("player:")) {
          playerItemFires.add(ev.source);
          itemFires++;
        }
        break;
      }
      case "damage":
      case "status_tick": {
        const value = ev.value ?? 0;
        if (ev.target === "opponent") damageDealt += value;
        else if (ev.target === "player") damageTaken += value;
        break;
      }
      case "heal": {
        if (ev.target === "player") healed += ev.value ?? 0;
        break;
      }
      case "shield_applied": {
        if (ev.target === "player") shieldApplied += ev.value ?? 0;
        break;
      }
    }
  }

  return {
    damageDealt,
    damageTaken,
    healed,
    shieldApplied,
    itemsUsed: playerItemFires.size,
    itemFires,
  };
}
