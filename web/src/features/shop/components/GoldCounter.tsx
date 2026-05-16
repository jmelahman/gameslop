// GoldCounter — the gold readout in the run banner. Two layers:
//   * AnimatedNumber ticks the displayed integer to the new value.
//   * A short color flash (green on gain, amber on loss) makes the change
//     legible even when the player isn't looking directly at the number.

import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

const FLASH_MS = 550;
const TONE = {
  gain: "#86efac",
  loss: "#fda4af",
  idle: "#f8fafc",
} as const;

type Flash = "gain" | "loss" | null;

export function GoldCounter({ value, nextDayGold }: { value: number; nextDayGold: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<Flash>(null);

  useEffect(() => {
    if (prev.current === value) return;
    setFlash(value > prev.current ? "gain" : "loss");
    prev.current = value;
    const t = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [value]);

  const color = flash ? TONE[flash] : TONE.idle;

  return (
    <div className="flex flex-col items-end gap-0.5 text-sm">
      <div className="flex items-center gap-1.5">
        <motion.span
          animate={{ scale: flash ? 1.15 : 1, rotate: flash === "gain" ? [0, -10, 10, 0] : 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Coins className="h-4 w-4 text-amber-300" />
        </motion.span>
        <motion.span
          animate={{ color }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="font-mono text-base tabular-nums"
        >
          <AnimatedNumber value={value} />
        </motion.span>
        <span className="text-slate-500 text-xs uppercase tracking-wider">gold</span>
      </div>
      {nextDayGold > 0 ? (
        <p className="text-amber-300/70 text-xs">+{nextDayGold} next day</p>
      ) : null}
    </div>
  );
}
