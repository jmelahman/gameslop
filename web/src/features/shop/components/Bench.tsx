// Bench (hand) row. Cards laid out in a fixed-cell grid; clicking a card
// promotes it to the first free board slot. Right-click sells it (a
// stretch goal for phase 12 — kept simple here with a sell button overlay
// on hover-ish layouts, but we render a tiny "$" badge for visibility).

import { ItemCard } from "@/components/game/ItemCard";
import type { BoardItem, Item } from "@/types/game";

const BENCH_WIDTH = 10;

type Props = {
  hand: BoardItem[];
  itemIndex: Record<string, Item>;
  pendingSlot?: number | null;
  onPlace: (handSlot: number) => void;
  onSell: (handSlot: number) => void;
};

export function Bench({ hand, itemIndex, pendingSlot, onPlace, onSell }: Props) {
  return (
    <section className="w-full">
      <header className="mb-2 flex items-baseline justify-between text-slate-400 text-xs uppercase tracking-wider">
        <span>Bench</span>
        <span className="font-mono">
          {hand.length} item{hand.length === 1 ? "" : "s"}
        </span>
      </header>
      <div
        className="grid h-32 gap-2"
        style={{ gridTemplateColumns: `repeat(${BENCH_WIDTH}, minmax(0, 1fr))` }}
      >
        {hand.map((h) => {
          const item = itemIndex[h.itemId];
          if (!item) return null;
          const pending = pendingSlot === h.slot;
          return (
            <div
              key={`hand-${h.slot}-${h.itemId}`}
              className="relative"
              style={{ gridColumn: "span 1" }}
            >
              <ItemCard
                item={item}
                onClick={() => onPlace(h.slot)}
                disabled={pending}
                className="h-full"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSell(h.slot);
                }}
                disabled={pending}
                aria-label={`Sell ${item.name}`}
                className="absolute top-1 left-1 z-10 rounded bg-rose-900/70 px-1.5 font-mono text-rose-100 text-xs hover:bg-rose-800 disabled:opacity-50"
              >
                +{item.sellValue}g
              </button>
            </div>
          );
        })}
        {emptySlots(hand.length, BENCH_WIDTH)}
      </div>
    </section>
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
