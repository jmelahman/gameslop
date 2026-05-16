// Progression constants mirroring internal/shop and internal/api.combat.
// Keep these in sync with the Go side; they are duplicated (not fetched)
// because they drive simple UI math that doesn't justify an extra round-trip.

export const MAX_DAY = 10;
export const MAX_SHOP_LEVEL = 4;
export const REFRESH_COST = 1;
export const XP_COST = 4;
export const LOSS_HP_COST = 20;
export const GOLD_WIN_BONUS = 2;

// XP required to level up FROM the given level. Lvl 1 → 2 = 4 XP, etc.
const XP_THRESHOLDS: Record<number, number> = { 1: 4, 2: 7, 3: 10 };

export function xpThreshold(level: number): number | null {
  return XP_THRESHOLDS[level] ?? null;
}

// dailyGoldFor returns the gold the player will receive at the start of the
// given day (1-indexed): min(3 + day, 10). Used for the "+X next day" preview.
export function dailyGoldFor(day: number): number {
  return Math.min(3 + day, 10);
}
