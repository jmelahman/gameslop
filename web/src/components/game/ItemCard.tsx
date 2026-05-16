// ItemCard — visual representation of a single catalog item. Used in the
// shop row, on the bench, and on the board. The card adopts a tier-colored
// ring; the body shows the item art (PNG from /items/<id>.png, lucide icon
// fallback), the name, a size badge, and tag icons. A motion tooltip
// appears on hover with the full description.

import { AnimatePresence, motion } from "framer-motion";
import { type LucideIcon, Beaker, Coins, HelpCircle, Shield, Sparkles, Swords } from "lucide-react";
import { type ButtonHTMLAttributes, useState } from "react";
import { cn } from "@/lib/cn";
import type { Item, Tier } from "@/types/game";

const TIER_COLORS: Record<Tier, { ring: string; text: string; badge: string }> = {
  bronze: { ring: "ring-amber-700/80", text: "text-amber-300", badge: "bg-amber-800/60" },
  silver: { ring: "ring-slate-300/80", text: "text-slate-100", badge: "bg-slate-500/60" },
  gold: { ring: "ring-yellow-300/80", text: "text-yellow-200", badge: "bg-yellow-500/40" },
  diamond: { ring: "ring-cyan-300/80", text: "text-cyan-100", badge: "bg-cyan-500/40" },
};

const TAG_ICONS: Record<string, LucideIcon> = {
  Weapon: Swords,
  Shield: Shield,
  Potion: Beaker,
  Trinket: Sparkles,
  Gold: Coins,
};

type Props = {
  item: Item;
  /** Optional accessory rendered in the top-right (frozen badge, slot index, …). */
  badge?: React.ReactNode;
  /** Cost shown in the footer (buy cost in shop, sell value on bench). */
  costLabel?: string;
  costTone?: "buy" | "sell";
  disabled?: boolean;
  onClick?: () => void;
  /** When true, give the card a glow that signals it's active/frozen. */
  highlight?: boolean;
  /** Hide the hover tooltip (e.g. for tightly packed shop rows). */
  showTooltip?: boolean;
  className?: string;
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled">;
};

export function ItemCard({
  item,
  badge,
  costLabel,
  costTone = "buy",
  disabled,
  onClick,
  highlight,
  showTooltip = true,
  className,
  buttonProps,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const tier = TIER_COLORS[item.tier];
  const slotWidth = item.size; // visual span (item-internal; ShopPage maps to grid)

  return (
    <div className={cn("relative", className)} style={{ gridColumn: `span ${slotWidth}` }}>
      <button
        {...buttonProps}
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        disabled={disabled}
        className={cn(
          "group relative flex h-full w-full flex-col items-stretch overflow-hidden rounded-md border border-slate-800 bg-slate-900/80 px-2 py-2 text-left transition-all",
          "ring-2",
          tier.ring,
          highlight && "shadow-[0_0_18px_rgba(56,189,248,0.35)]",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:-translate-y-0.5 hover:bg-slate-900",
        )}
        aria-label={`${item.name} (${item.tier})`}
      >
        <span className="flex flex-1 items-center justify-center py-2">
          <ItemArt item={item} />
        </span>

        <span className={cn("truncate font-semibold text-sm", tier.text)}>{item.name}</span>

        <span className="mt-1 flex items-center justify-between text-slate-400 text-xs">
          <TagRow tags={item.tags} />
          <span className={cn("rounded px-1.5 font-mono", tier.badge)}>
            {slotWidth === 1 ? "1×" : `${slotWidth}×`}
          </span>
        </span>

        {costLabel ? (
          <span
            className={cn(
              "mt-1 self-start rounded px-1.5 font-mono text-xs",
              costTone === "buy"
                ? "bg-amber-900/60 text-amber-200"
                : "bg-emerald-900/60 text-emerald-200",
            )}
          >
            {costLabel}
          </span>
        ) : null}
      </button>

      {/* Badge is rendered as a sibling of the card button (not a child), so
          interactive badges like freeze/sell can themselves be <button>s
          without producing nested-button hydration errors. */}
      {badge ? (
        <span className="pointer-events-auto absolute top-1 right-1 z-10">{badge}</span>
      ) : null}

      <AnimatePresence>
        {showTooltip && hovered ? (
          <motion.div
            key="tooltip"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-xl"
          >
            <p className={cn("font-semibold text-sm", tier.text)}>{item.name}</p>
            <p className="mt-1 capitalize text-slate-400">
              {item.tier} · size {item.size} · {item.tags.join(", ") || "no tags"}
            </p>
            <p className="mt-2 text-slate-300">
              Buy {item.buyCost}g · Sell {item.sellValue}g
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ItemArt({ item }: { item: Item }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <FallbackIcon tier={item.tier} tag={item.tags[0]} />;
  }
  return (
    <img
      src={`/items/${item.id}.png`}
      alt=""
      className="h-12 w-12 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function FallbackIcon({ tier, tag }: { tier: Tier; tag?: string }) {
  const Icon: LucideIcon = (tag ? TAG_ICONS[tag] : undefined) ?? HelpCircle;
  return <Icon className={cn("h-10 w-10", TIER_COLORS[tier].text)} aria-hidden="true" />;
}

function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-slate-600 italic">no tags</span>;
  }
  return (
    <span className="flex items-center gap-1">
      {tags.map((tag) => {
        const Icon = TAG_ICONS[tag] ?? HelpCircle;
        return <Icon key={tag} className="h-3.5 w-3.5" aria-label={tag} />;
      })}
    </span>
  );
}
