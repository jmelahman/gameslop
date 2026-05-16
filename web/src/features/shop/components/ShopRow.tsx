// Bottom-right shop row. Each shop slot is an ItemCard with a buy
// affordance + a freeze toggle that overlays the top-right.

import { RefreshCw, Snowflake, TrendingUp } from "lucide-react";
import { ItemCard } from "@/components/game/ItemCard";
import { cn } from "@/lib/cn";
import type { Item, ShopItem } from "@/types/game";

type Props = {
  shop: ShopItem[];
  shopLevel: number;
  gold: number;
  itemIndex: Record<string, Item>;
  pendingShopIndex?: number | null;
  onBuy: (index: number) => void;
  onFreeze: (index: number, frozen: boolean) => void;
  onRefresh: () => void;
  onXP: () => void;
  refreshCost: number;
  xpCost: number;
  maxShopLevel: number;
};

export function ShopRow({
  shop,
  shopLevel,
  gold,
  itemIndex,
  pendingShopIndex,
  onBuy,
  onFreeze,
  onRefresh,
  onXP,
  refreshCost,
  xpCost,
  maxShopLevel,
}: Props) {
  return (
    <section className="w-full rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <header className="mb-2 flex items-baseline justify-between text-slate-300 text-xs uppercase tracking-wider">
        <span>Shop · Lv {shopLevel}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={gold < refreshCost}
            className={cn(
              "flex items-center gap-1 rounded border border-slate-700 px-2 py-1 font-mono text-slate-200",
              gold < refreshCost
                ? "cursor-not-allowed opacity-50"
                : "hover:border-amber-500 hover:text-amber-200",
            )}
            aria-label="Refresh shop"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {refreshCost}g
          </button>
          <button
            type="button"
            onClick={onXP}
            disabled={gold < xpCost || shopLevel >= maxShopLevel}
            className={cn(
              "flex items-center gap-1 rounded border border-slate-700 px-2 py-1 font-mono text-slate-200",
              gold < xpCost || shopLevel >= maxShopLevel
                ? "cursor-not-allowed opacity-50"
                : "hover:border-emerald-500 hover:text-emerald-200",
            )}
            aria-label="Level up shop"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            {shopLevel >= maxShopLevel ? "max" : `${xpCost}g`}
          </button>
        </div>
      </header>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(shop.length, 1)}, minmax(0, 1fr))` }}
      >
        {shop.map((s, i) => {
          // The shop index IS the slot identity — shop[i] is "shop slot i".
          // Reordering would change semantics, so the index is the right key.
          const key = `shop-${i}`;
          if (!s.itemId) {
            return (
              <div
                key={key}
                className="h-32 rounded-md border-2 border-slate-800 border-dashed bg-slate-950/30"
              />
            );
          }
          const item = itemIndex[s.itemId];
          if (!item) {
            return (
              <div
                key={key}
                className="h-32 rounded-md border border-rose-800 bg-rose-950/30 p-2 text-rose-200 text-xs"
              >
                unknown item: {s.itemId}
              </div>
            );
          }
          const pending = pendingShopIndex === i;
          const cantAfford = gold < item.buyCost;
          return (
            <ItemCard
              key={key}
              item={item}
              onClick={() => onBuy(i)}
              disabled={pending || cantAfford}
              highlight={s.frozen}
              costLabel={`${item.buyCost}g`}
              costTone="buy"
              badge={
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFreeze(i, !s.frozen);
                  }}
                  className={cn(
                    "rounded p-1 transition-colors",
                    s.frozen
                      ? "bg-cyan-500/40 text-cyan-100"
                      : "bg-slate-800/80 text-slate-400 hover:text-cyan-200",
                  )}
                  aria-label={s.frozen ? "Unfreeze" : "Freeze"}
                >
                  <Snowflake className="h-3 w-3" />
                </button>
              }
            />
          );
        })}
      </div>
    </section>
  );
}
