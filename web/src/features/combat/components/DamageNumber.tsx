// DamageNumber — floating damage / heal numbers above a combatant. Stacks
// concurrent hits with a small delay so they're individually readable.
//
// The parent feeds in a rolling window of "active" damage events keyed by
// stable ids; AnimatePresence handles enter / exit transitions so each
// number animates over its full 600ms even though the underlying tick only
// lasts 100ms.

import { AnimatePresence, motion } from "framer-motion";
import { dmgPopup } from "@/lib/animations";
import { cn } from "@/lib/cn";
import type { TickEvent } from "@/types/game";

export type DamageEntry = {
  // Stable identifier across re-renders — used as the AnimatePresence key.
  id: string;
  event: TickEvent;
};

type Props = {
  entries: DamageEntry[];
};

export function DamageNumber({ entries }: Props) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-2 flex justify-center"
      aria-hidden="true"
    >
      <AnimatePresence>
        {entries.map((entry, i) => {
          const ev = entry.event;
          const isHeal = ev.type === "heal";
          const sign = isHeal ? "+" : "-";
          return (
            <motion.span
              key={entry.id}
              variants={dmgPopup}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ marginLeft: i === 0 ? 0 : 6 }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                "select-none font-bold text-2xl drop-shadow-md",
                isHeal ? "text-emerald-300" : "text-rose-300",
              )}
            >
              {sign}
              {ev.value ?? 0}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
