// DayTransition — full-screen "Day X" curtain that plays for ~1.4s whenever
// the active day changes. Lives on ShopPage so it fires every time the player
// returns from combat. Re-keys on day so each transition is a fresh animation.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const DURATION_MS = 1400;

export function DayTransition({ day, maxDay }: { day: number; maxDay: number }) {
  const [visible, setVisible] = useState(true);
  const [shownFor, setShownFor] = useState(day);

  useEffect(() => {
    setShownFor(day);
    setVisible(true);
    const t = setTimeout(() => setVisible(false), DURATION_MS);
    return () => clearTimeout(t);
  }, [day]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key={shownFor}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <motion.div
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="relative flex flex-col items-center gap-1"
            initial={{ y: 20, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: -16, scale: 1.04, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-slate-400 text-xs uppercase tracking-[0.4em]">Day</span>
            <span className="font-bold text-7xl text-amber-200 tabular-nums tracking-tight">
              {shownFor}
              <span className="text-3xl text-slate-500">/{maxDay}</span>
            </span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
