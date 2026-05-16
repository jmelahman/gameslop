// SynergyPanel — a compact horizontal strip above the bench listing every
// tag the player has stacked on their board, with progress toward the
// nominal synergy target. Empty (rendered as a hint) when the player owns
// no tagged board items yet.
//
// The panel doubles as a hover affordance: when the player hovers a card
// (anywhere) that contributes to a tag, the corresponding chip lights up,
// reinforcing the cross-board highlight that the ItemCard glow provides.

import { motion } from "framer-motion";
import { type LucideIcon, Beaker, Coins, HelpCircle, Shield, Sparkles, Swords } from "lucide-react";
import { cn } from "@/lib/cn";
import { type SynergyCount, SYNERGY_TARGET } from "../synergy";

const TAG_ICONS: Record<string, LucideIcon> = {
  Weapon: Swords,
  Shield: Shield,
  Potion: Beaker,
  Trinket: Sparkles,
  Gold: Coins,
};

type Props = {
  counts: SynergyCount[];
  /** Tags belonging to whichever item is hovered (anywhere). The matching
   *  chips pop to draw the player's eye to the synergy in play. */
  highlightTags?: ReadonlySet<string>;
};

export function SynergyPanel({ counts, highlightTags }: Props) {
  if (counts.length === 0) {
    return (
      <p className="text-slate-500 text-xs italic">
        No board synergies yet — buy items sharing a tag to stack effects.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {counts.map((c) => {
        const Icon = TAG_ICONS[c.tag] ?? HelpCircle;
        const lit = highlightTags?.has(c.tag) ?? false;
        return (
          <motion.li
            key={c.tag}
            animate={lit ? { scale: 1.06 } : { scale: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
              c.full
                ? "border-emerald-400/80 bg-emerald-500/15 text-emerald-100"
                : c.active
                  ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
                  : "border-slate-700 bg-slate-900/60 text-slate-300",
              lit && "ring-2 ring-emerald-300/60",
            )}
            aria-label={`${c.tag}: ${c.count} of ${SYNERGY_TARGET}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-medium">{c.tag}</span>
            <span className="font-mono text-[0.7rem] text-slate-400">
              {c.count}
              <span className="text-slate-600">/{SYNERGY_TARGET}</span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
