// ItemCard — visual representation of a single catalog item. Used in the
// shop row, on the bench, and on the board. The card adopts a tier-colored
// ring; the body shows the item art (PNG from /items/<id>.png, lucide icon
// fallback), the name, a size badge, and tag icons. A motion tooltip
// appears on hover with the full description.

import { AnimatePresence, motion } from "framer-motion";
import { type LucideIcon, Beaker, Coins, HelpCircle, Shield, Sparkles, Swords } from "lucide-react";
import { type ButtonHTMLAttributes, type MouseEvent as ReactMouseEvent, useState } from "react";
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
  /** Right-click handler. When set the browser context menu is suppressed. */
  onContextMenu?: () => void;
  /** When true, give the card a glow that signals it's active/frozen. */
  highlight?: boolean;
  /** When true, render an icy overlay (used for frozen shop slots). */
  frost?: boolean;
  /** Emerald outline + glow signaling a tag synergy match. */
  synergyHighlight?: boolean;
  /** Hide the hover tooltip (e.g. for tightly packed shop rows). */
  showTooltip?: boolean;
  /** Shown in the tooltip footer as "Sell for Xg". When set, the tooltip's
   *  default buy/sell summary line is replaced by the sell preview alone. */
  sellPreview?: number;
  /** Notified when the card hover state changes (used by ShopPage to track
   *  the currently-hovered card for keyboard shortcuts and synergy hints). */
  onHoverChange?: (hovered: boolean) => void;
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
  onContextMenu,
  highlight,
  frost,
  synergyHighlight,
  showTooltip = true,
  sellPreview,
  onHoverChange,
  className,
  buttonProps,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const tier = TIER_COLORS[item.tier];
  const slotWidth = item.size;

  const setHover = (h: boolean) => {
    setHovered(h);
    onHoverChange?.(h);
  };

  const handleContextMenu = onContextMenu
    ? (e: ReactMouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onContextMenu();
      }
    : undefined;

  return (
    <div className={cn("relative", className)} style={{ gridColumn: `span ${slotWidth}` }}>
      <button
        {...buttonProps}
        type="button"
        onClick={onClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        disabled={disabled}
        className={cn(
          "group relative flex h-full w-full flex-col items-stretch overflow-hidden rounded-md border border-slate-800 bg-slate-900/80 px-2 py-2 text-left transition-all",
          "ring-2",
          tier.ring,
          highlight && "shadow-[0_0_18px_rgba(56,189,248,0.35)]",
          synergyHighlight && "ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.55)]",
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

        {frost ? <FrostOverlay /> : null}
      </button>

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
            {sellPreview !== undefined ? (
              <p className="mt-2 flex items-center gap-1 text-emerald-300">
                <Coins className="h-3 w-3" />
                Sell for {sellPreview}g<span className="ml-1 text-slate-500">(right-click)</span>
              </p>
            ) : (
              <p className="mt-2 text-slate-300">
                Buy {item.buyCost}g · Sell {item.sellValue}g
              </p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// FrostOverlay — translucent icy crystal pattern with subtle pulse, layered
// over a frozen shop card. Pointer-events-none so the card body still
// receives clicks/drags.
function FrostOverlay() {
  return (
    <span
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-md"
      aria-hidden="true"
    >
      <motion.span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(186,230,253,0.45), transparent 55%), radial-gradient(circle at 75% 70%, rgba(165,243,252,0.4), transparent 60%), linear-gradient(135deg, rgba(56,189,248,0.18), rgba(8,47,73,0.15))",
        }}
        animate={{ opacity: [0.7, 0.95, 0.7] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(60deg, rgba(186,230,253,0.18) 0 1px, transparent 1px 8px), repeating-linear-gradient(-60deg, rgba(186,230,253,0.14) 0 1px, transparent 1px 12px)",
          mixBlendMode: "screen",
        }}
      />
      <span
        className="absolute inset-0 rounded-md border border-cyan-200/50"
        style={{ boxShadow: "inset 0 0 18px rgba(125,211,252,0.45)" }}
      />
    </span>
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
