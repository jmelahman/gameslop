// Bottom-right shop row. Each shop slot is an ItemCard with a buy
// affordance + a freeze toggle that overlays the top-right. Cards are also
// drag sources — dropping a shop item on the bench (or anywhere else) buys
// it.

import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { RefreshCw, Snowflake, TrendingUp } from "lucide-react";
import { ItemCard } from "@/components/game/ItemCard";
import { cn } from "@/lib/cn";
import type { Item, ShopItem } from "@/types/game";
import { type DragSource, sourceId } from "../dnd";

type Props = {
  shop: ShopItem[];
  shopLevel: number;
  xp: number;
  /** XP needed to reach next level, or null when at max level. */
  xpToLevel: number | null;
  gold: number;
  itemIndex: Record<string, Item>;
  pendingShopIndex?: number | null;
  /** Index of the shop slot currently being dragged (so we can ghost it). */
  draggingFromIndex: number | null;
  /** Tags belonging to whichever item is currently hovered (anywhere on the
   *  page) — used to outline shop items that share a tag with a board item
   *  the player is examining. */
  synergyTags?: ReadonlySet<string>;
  /** Currently keyboard/mouse-focused shop slot (for the F shortcut). */
  hoveredIndex?: number | null;
  onBuy: (index: number) => void;
  onFreeze: (index: number, frozen: boolean) => void;
  onRefresh: () => void;
  onXP: () => void;
  /** Notified when a shop slot is hovered/unhovered. */
  onSlotHoverChange?: (index: number | null) => void;
  refreshCost: number;
  xpCost: number;
  maxShopLevel: number;
  /** True while a refresh mutation is in flight; spins the icon. */
  refreshing?: boolean;
  /** True while an XP mutation is in flight. */
  buyingXP?: boolean;
};

export function ShopRow({
  shop,
  shopLevel,
  xp,
  xpToLevel,
  gold,
  itemIndex,
  pendingShopIndex,
  draggingFromIndex,
  synergyTags,
  hoveredIndex,
  onBuy,
  onFreeze,
  onRefresh,
  onXP,
  onSlotHoverChange,
  refreshCost,
  xpCost,
  maxShopLevel,
  refreshing,
  buyingXP,
}: Props) {
  const atMaxLevel = shopLevel >= maxShopLevel;
  const canRefresh = gold >= refreshCost;
  const canBuyXP = gold >= xpCost && !atMaxLevel;
  return (
    <section className="w-full rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <header className="mb-2 flex items-baseline justify-between text-slate-300 text-xs uppercase tracking-wider">
        <span className="flex items-center gap-2">
          Shop · Lv {shopLevel}
          {atMaxLevel || xpToLevel === null ? (
            <span className="text-emerald-300/70">(max)</span>
          ) : (
            <span className="font-mono text-slate-400 normal-case">
              {xp}/{xpToLevel} XP
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <RefreshButton
            cost={refreshCost}
            canAfford={canRefresh}
            spinning={refreshing ?? false}
            onClick={onRefresh}
          />
          <XPButton
            cost={xpCost}
            disabled={!canBuyXP}
            atMax={atMaxLevel}
            pending={buyingXP ?? false}
            onClick={onXP}
          />
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
          const ghost = draggingFromIndex === i;
          const focused = hoveredIndex === i;
          const synergy = synergyTags ? item.tags.some((t) => synergyTags.has(t)) : false;
          const src: DragSource = {
            kind: "shop",
            index: i,
            itemId: item.id,
            size: item.size,
          };
          return (
            <DraggableShopSlot
              key={key}
              id={sourceId(src)}
              data={src}
              ghost={ghost}
              focused={focused}
            >
              <ItemCard
                item={item}
                onClick={() => onBuy(i)}
                onHoverChange={(h) => onSlotHoverChange?.(h ? i : null)}
                disabled={pending || cantAfford}
                highlight={s.frozen}
                frost={s.frozen}
                synergyHighlight={synergy}
                costLabel={`${item.buyCost}g`}
                costTone="buy"
                badge={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFreeze(i, !s.frozen);
                    }}
                    aria-pressed={s.frozen}
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
            </DraggableShopSlot>
          );
        })}
      </div>
    </section>
  );
}

function RefreshButton({
  cost,
  canAfford,
  spinning,
  onClick,
}: {
  cost: number;
  canAfford: boolean;
  spinning: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canAfford || spinning}
      title={canAfford ? `Reroll the shop (${cost}g) · R` : `Need ${cost}g to reroll`}
      className={cn(
        "group relative flex items-center gap-1 rounded border border-slate-700 px-2 py-1 font-mono text-slate-200",
        !canAfford || spinning
          ? "cursor-not-allowed opacity-50"
          : "hover:border-amber-500 hover:text-amber-200",
      )}
      aria-label={`Reroll shop for ${cost} gold (R)`}
      data-testid="shop-refresh"
    >
      <motion.span
        animate={spinning ? { rotate: 360 } : { rotate: 0 }}
        transition={
          spinning ? { duration: 0.7, repeat: Infinity, ease: "linear" } : { duration: 0.2 }
        }
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </motion.span>
      <span className="flex items-baseline gap-0.5">
        <span>{cost}</span>
        <span className="text-slate-400 text-[0.65rem]">g</span>
      </span>
      <span className="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-1 hidden whitespace-nowrap rounded bg-slate-950/95 px-2 py-1 text-[0.65rem] text-slate-200 normal-case opacity-0 shadow group-hover:block group-hover:opacity-100">
        Reroll · {cost}g · <kbd className="rounded bg-slate-800 px-1">R</kbd>
      </span>
    </button>
  );
}

function XPButton({
  cost,
  disabled,
  atMax,
  pending,
  onClick,
}: {
  cost: number;
  disabled: boolean;
  atMax: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      animate={pending ? { y: [-1, 1, -1] } : { y: 0 }}
      transition={pending ? { duration: 0.4, repeat: Infinity, ease: "easeInOut" } : {}}
      className={cn(
        "flex items-center gap-1 rounded border border-slate-700 px-2 py-1 font-mono text-slate-200",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-emerald-500 hover:text-emerald-200",
      )}
      aria-label={atMax ? "Shop level maxed" : `Buy XP for ${cost} gold`}
      data-testid="shop-xp"
    >
      <TrendingUp className="h-3.5 w-3.5" />
      {atMax ? "max" : `${cost}g`}
    </motion.button>
  );
}

function DraggableShopSlot({
  id,
  data,
  ghost,
  focused,
  children,
}: {
  id: string;
  data: DragSource;
  ghost: boolean;
  focused: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ touchAction: "none" }}
      className={cn(
        "cursor-grab transition-transform active:cursor-grabbing",
        (ghost || isDragging) && "opacity-25",
        focused && "-translate-y-0.5",
      )}
      data-focused={focused || undefined}
    >
      {children}
    </div>
  );
}
