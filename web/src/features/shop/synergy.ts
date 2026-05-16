// Tag synergy math, kept tiny and pure so ShopPage can pass plain data
// down to display components.
//
// A "synergy" is meaningful when you own 2+ board items sharing a tag; the
// nominal "full bonus" target is 3. The page renders progress against that
// target in the synergy panel and uses the same tag map to cross-highlight
// matching items when one is hovered.

import type { BoardItem, Item } from "@/types/game";

export const SYNERGY_TARGET = 3;

export type SynergyCount = {
  tag: string;
  count: number;
  active: boolean; // count >= 2
  full: boolean; // count >= SYNERGY_TARGET
};

export function countBoardTags(
  board: BoardItem[],
  itemIndex: Record<string, Item>,
): SynergyCount[] {
  const counts = new Map<string, number>();
  for (const b of board) {
    const def = itemIndex[b.itemId];
    if (!def) continue;
    for (const tag of def.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({
      tag,
      count,
      active: count >= 2,
      full: count >= SYNERGY_TARGET,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function tagsOfItem(itemId: string, itemIndex: Record<string, Item>): ReadonlySet<string> {
  const def = itemIndex[itemId];
  return new Set(def?.tags ?? []);
}
