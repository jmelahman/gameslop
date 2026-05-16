// 10-column board grid. Items occupy a contiguous range of cells via
// gridColumnStart + span. Empty cells get a dashed outline so players see
// their available board space at a glance.

import { Snowflake } from "lucide-react";
import { ItemCard } from "@/components/game/ItemCard";
import { cn } from "@/lib/cn";
import type { BoardItem, Item } from "@/types/game";

const BOARD_WIDTH = 10;

type Props = {
  board: BoardItem[];
  itemIndex: Record<string, Item>;
  pendingSlot?: number | null;
  onRemove: (slot: number) => void;
};

export function BoardGrid({ board, itemIndex, pendingSlot, onRemove }: Props) {
  const cellsUsed = computeOccupancy(board, itemIndex);

  return (
    <section className="w-full">
      <header className="mb-2 flex items-baseline justify-between text-slate-400 text-xs uppercase tracking-wider">
        <span>Board</span>
        <span className="font-mono">
          {cellsUsed} / {BOARD_WIDTH}
        </span>
      </header>
      <div
        className="grid h-32 gap-2"
        style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(0, 1fr))` }}
      >
        {board.map((b) => {
          const item = itemIndex[b.itemId];
          if (!item) return null;
          const pending = pendingSlot === b.slot;
          return (
            <div
              key={`board-${b.slot}-${b.itemId}`}
              style={{
                gridColumnStart: b.slot + 1,
                gridColumn: `${b.slot + 1} / span ${item.size}`,
              }}
            >
              <ItemCard
                item={item}
                onClick={() => onRemove(b.slot)}
                disabled={pending}
                badge={pending ? <Snowflake className="h-3.5 w-3.5 text-cyan-300" /> : undefined}
                className="h-full"
              />
            </div>
          );
        })}
        <EmptyCells board={board} itemIndex={itemIndex} />
      </div>
    </section>
  );
}

function EmptyCells({ board, itemIndex }: { board: BoardItem[]; itemIndex: Record<string, Item> }) {
  const occupied = new Set<number>();
  for (const b of board) {
    const item = itemIndex[b.itemId];
    const size = item?.size ?? 1;
    for (let i = 0; i < size; i++) occupied.add(b.slot + i);
  }
  const cells = [];
  for (let i = 0; i < BOARD_WIDTH; i++) {
    if (occupied.has(i)) continue;
    cells.push(
      <div
        key={`empty-${i}`}
        style={{ gridColumnStart: i + 1, gridColumn: `${i + 1} / span 1` }}
        className={cn("rounded-md border-2 border-slate-800 border-dashed bg-slate-950/40")}
      />,
    );
  }
  return <>{cells}</>;
}

function computeOccupancy(board: BoardItem[], itemIndex: Record<string, Item>): number {
  let used = 0;
  for (const b of board) {
    const item = itemIndex[b.itemId];
    used += item?.size ?? 1;
  }
  return used;
}
