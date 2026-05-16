// StatusIcons — chips for the active side-scoped statuses (poison / burn).
// Each chip carries a tickKey so it pulses when a status_tick event fires on
// the current frame; new statuses scale in via AnimatePresence.

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/cn";

export type StatusKind = "poison" | "burn";

export type StatusEntry = {
  kind: StatusKind;
  stacks: number;
};

type Props = {
  entries: StatusEntry[];
  // Bump per-kind whenever a status_tick / status_applied fires on the side.
  pulseKey: string;
};

const COLORS: Record<StatusKind, string> = {
  poison: "border-emerald-500/60 bg-emerald-900/40 text-emerald-200",
  burn: "border-orange-500/60 bg-orange-900/40 text-orange-200",
};

const GLYPHS: Record<StatusKind, string> = {
  poison: "☣",
  burn: "🔥",
};

export function StatusIcons({ entries, pulseKey }: Props) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Active statuses">
      <AnimatePresence initial={false}>
        {entries.map((s) => (
          <motion.li
            key={`${s.kind}:${pulseKey}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [1.15, 1], opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px]",
              COLORS[s.kind],
            )}
          >
            <span aria-hidden>{GLYPHS[s.kind]}</span>
            {s.stacks}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
