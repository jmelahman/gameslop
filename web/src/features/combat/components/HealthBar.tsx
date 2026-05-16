// HealthBar — animates between HP values via Framer Motion. The bar's width
// is tweened with a spring so big hits feel punchy and small ticks drain
// smoothly. The numeric readout snaps so the player can always tell exact HP.

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";

type Props = {
  hp: number;
  startHp: number;
  // Tailwind classes for the filled portion (e.g. "bg-amber-400").
  accent: string;
};

export function HealthBar({ hp, startHp, accent }: Props) {
  const pct = startHp > 0 ? Math.max(0, Math.min(100, (hp / startHp) * 100)) : 0;
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
        <motion.div
          className={cn("h-full rounded-full", accent)}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 28, mass: 0.6 }}
        />
      </div>
      <div className="flex justify-end font-mono text-slate-300 text-xs">
        {Math.max(0, hp)} / {startHp}
      </div>
    </div>
  );
}
