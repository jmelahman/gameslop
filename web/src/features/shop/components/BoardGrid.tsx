// 10-column board grid. Items occupy a contiguous range of cells via
// gridColumnStart + span. Each of the 10 cells is a dnd-kit droppable so the
// page-level drag handler can route hand→board, board→board, and
// shop→board drops to the right mutation. Items already on the board are
// themselves draggable (board↔board reorder, board→bench, board→sell).

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ItemCard } from "@/components/game/ItemCard";
import { cn } from "@/lib/cn";
import type { BoardItem, Item } from "@/types/game";
import { boardCellId, BOARD_WIDTH, type DragSource, sourceId } from "../dnd";

type HoverState = {
  start: number;
  size: number;
  valid: boolean;
  invalidFlash: boolean;
};

type Props = {
  board: BoardItem[];
  itemIndex: Record<string, Item>;
  /** Slot index of the item being dragged off the board (so we can ghost it). */
  draggingFromSlot: number | null;
  /** Highlight overlay describing the placement preview during drag. */
  hover: HoverState | null;
};

export function BoardGrid({ board, itemIndex, draggingFromSlot, hover }: Props) {
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
        className="relative grid h-32 gap-2"
        style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(0, 1fr))` }}
      >
        {/* Render the 10 droppable cells first so they sit behind any item
            cards and don't intercept pointer events on the cards. The cell
            index is the slot identity — it doesn't reorder. */}
        {Array.from({ length: BOARD_WIDTH }, (_, i) => i).map((slot) => (
          <BoardCell key={`cell-${slot}`} slot={slot} />
        ))}

        {/* Placement preview ribbon spans `size` cells starting at `start`. */}
        {hover ? (
          <div
            className={cn(
              "pointer-events-none rounded-md border-2 transition-colors",
              hover.invalidFlash
                ? "animate-pulse border-rose-500 bg-rose-500/30"
                : hover.valid
                  ? "border-emerald-400 bg-emerald-400/15"
                  : "border-rose-500 bg-rose-500/15",
            )}
            style={{
              gridColumn: `${hover.start + 1} / span ${hover.size}`,
              gridRow: 1,
            }}
          />
        ) : null}

        {board.map((b) => {
          const item = itemIndex[b.itemId];
          if (!item) return null;
          const isSource = draggingFromSlot === b.slot;
          const src: DragSource = {
            kind: "board",
            slot: b.slot,
            itemId: b.itemId,
            size: item.size,
          };
          return (
            <DraggableBoardItem
              key={`board-${b.slot}-${b.itemId}`}
              id={sourceId(src)}
              data={src}
              startCol={b.slot + 1}
              span={item.size}
              ghost={isSource}
            >
              <ItemCard item={item} className="h-full" />
            </DraggableBoardItem>
          );
        })}
      </div>
    </section>
  );
}

function BoardCell({ slot }: { slot: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: boardCellId(slot),
    data: { kind: "board-cell", slot },
  });
  return (
    <div
      ref={setNodeRef}
      data-testid={`board-cell-${slot}`}
      aria-label={`Board slot ${slot}`}
      style={{ gridColumn: `${slot + 1} / span 1`, gridRow: 1 }}
      className={cn(
        "rounded-md border-2 border-slate-800 border-dashed bg-slate-950/40 transition-colors",
        isOver && "border-slate-600",
      )}
    />
  );
}

function DraggableBoardItem({
  id,
  data,
  startCol,
  span,
  ghost,
  children,
}: {
  id: string;
  data: DragSource;
  startCol: number;
  span: number;
  ghost: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        gridColumn: `${startCol} / span ${span}`,
        gridRow: 1,
        touchAction: "none",
      }}
      className={cn("cursor-grab active:cursor-grabbing", (ghost || isDragging) && "opacity-25")}
    >
      {children}
    </div>
  );
}

function computeOccupancy(board: BoardItem[], itemIndex: Record<string, Item>): number {
  let used = 0;
  for (const b of board) {
    const item = itemIndex[b.itemId];
    used += item?.size ?? 1;
  }
  return used;
}
