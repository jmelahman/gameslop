// Bench (hand) row. The bench is one big drop target — items dropped on
// any bench cell go to the next free hand slot (the server appends). Each
// bench card is a drag source so it can be moved to the board or onto the
// sell zone. Right-clicking a bench card sells it directly.

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ItemCard } from "@/components/game/ItemCard";
import { cn } from "@/lib/cn";
import type { BoardItem, Item } from "@/types/game";
import { BENCH_DROP_ID, type DragSource, sourceId } from "../dnd";

const BENCH_WIDTH = 10;

type Props = {
  hand: BoardItem[];
  itemIndex: Record<string, Item>;
  /** Hand slot of the item currently being dragged (so we can ghost it). */
  draggingFromSlot: number | null;
  onSell?: (slot: number) => void;
  /** Notified with the itemId of whichever bench card is hovered. */
  onHoverItem?: (itemId: string | null) => void;
  /** Tags belonging to the externally-hovered item (a shop card, typically).
   *  Bench cards matching any of these get a synergy highlight. */
  synergyTags?: ReadonlySet<string>;
};

export function Bench({
  hand,
  itemIndex,
  draggingFromSlot,
  onSell,
  onHoverItem,
  synergyTags,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: BENCH_DROP_ID,
    data: { kind: "bench" },
  });

  return (
    <section className="w-full">
      <header className="mb-2 flex items-baseline justify-between text-slate-400 text-xs uppercase tracking-wider">
        <span>Bench</span>
        <span className="font-mono">
          {hand.length} item{hand.length === 1 ? "" : "s"}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "grid h-32 gap-2 rounded-md border-2 border-transparent p-1 transition-colors",
          isOver && "border-emerald-500/60 bg-emerald-500/5",
        )}
        style={{ gridTemplateColumns: `repeat(${BENCH_WIDTH}, minmax(0, 1fr))` }}
      >
        {hand.map((h) => {
          const item = itemIndex[h.itemId];
          if (!item) return null;
          const isSource = draggingFromSlot === h.slot;
          const synergy = synergyTags ? item.tags.some((t) => synergyTags.has(t)) : false;
          const src: DragSource = {
            kind: "hand",
            slot: h.slot,
            itemId: h.itemId,
            size: item.size,
          };
          return (
            <DraggableHandItem
              key={`hand-${h.slot}-${h.itemId}`}
              id={sourceId(src)}
              data={src}
              ghost={isSource}
            >
              <ItemCard
                item={item}
                className="h-full"
                sellPreview={item.sellValue}
                synergyHighlight={synergy}
                onContextMenu={onSell ? () => onSell(h.slot) : undefined}
                onHoverChange={(hov) => onHoverItem?.(hov ? item.id : null)}
              />
            </DraggableHandItem>
          );
        })}
        {emptySlots(hand.length, BENCH_WIDTH)}
      </div>
    </section>
  );
}

function DraggableHandItem({
  id,
  data,
  ghost,
  children,
}: {
  id: string;
  data: DragSource;
  ghost: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ gridColumn: "span 1", touchAction: "none" }}
      className={cn("cursor-grab active:cursor-grabbing", (ghost || isDragging) && "opacity-25")}
    >
      {children}
    </div>
  );
}

function emptySlots(used: number, total: number) {
  const out = [];
  for (let i = used; i < total; i++) {
    out.push(
      <div
        key={`bench-empty-${i}`}
        className="rounded-md border-2 border-slate-900 border-dashed bg-slate-950/30"
      />,
    );
  }
  return out;
}
