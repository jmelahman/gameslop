// Drag-and-drop wire types shared between ShopPage and the board/bench
// sub-components. The DnD layer reasons in terms of "source" (where an item
// was picked up from) and "target" (where it was dropped). Slot indices are
// always the leftmost cell of a multi-slot item.

export const BOARD_WIDTH = 10;

export type DragSource =
  | { kind: "shop"; index: number; itemId: string; size: number }
  | { kind: "hand"; slot: number; itemId: string; size: number }
  | { kind: "board"; slot: number; itemId: string; size: number };

export type DropTarget =
  | { kind: "board-cell"; slot: number }
  | { kind: "bench" }
  | { kind: "sell" };

export function sourceId(s: DragSource): string {
  if (s.kind === "shop") return `shop-${s.index}`;
  if (s.kind === "hand") return `hand-${s.slot}`;
  return `board-${s.slot}`;
}

export function boardCellId(slot: number): string {
  return `board-cell-${slot}`;
}

export const BENCH_DROP_ID = "bench-drop";
export const SELL_DROP_ID = "sell-drop";

// boardRangeFree checks that [start, start+size) is unoccupied on the given
// board, ignoring the item at `ignoreSlot` (used when dragging a board item
// onto a new position — its own cells shouldn't count as occupied).
export function boardRangeFree(
  board: Array<{ itemId: string; slot: number }>,
  itemIndex: Record<string, { size: number }>,
  start: number,
  size: number,
  ignoreSlot?: number,
): boolean {
  if (start < 0 || start + size > BOARD_WIDTH) return false;
  for (const b of board) {
    if (b.slot === ignoreSlot) continue;
    const w = itemIndex[b.itemId]?.size ?? 1;
    if (b.slot + w <= start) continue;
    if (b.slot >= start + size) continue;
    return false;
  }
  return true;
}
