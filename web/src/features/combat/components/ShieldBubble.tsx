// ShieldBubble — small badge next to the HP readout showing current shield.
// Pulses when shield is applied; shakes-and-fades when it breaks. The parent
// passes `pulseKey` / `breakKey` that change whenever the corresponding event
// fires on the current tick, which re-triggers the animation via the key.

import { AnimatePresence, motion } from "framer-motion";

type Props = {
  shield: number;
  pulseKey: string;
  breakKey: string | null;
};

export function ShieldBubble({ shield, pulseKey, breakKey }: Props) {
  return (
    <span className="relative inline-flex items-center">
      <AnimatePresence>
        {shield > 0 && (
          <motion.span
            key={pulseKey}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [1.15, 1], opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="inline-flex items-center gap-1 rounded-full border border-sky-500/60 bg-sky-900/50 px-2 py-0.5 font-mono text-sky-200 text-xs"
            aria-label={`${shield} shield`}
          >
            <span aria-hidden>◈</span>
            {shield}
          </motion.span>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {breakKey && (
          <motion.span
            key={breakKey}
            initial={{ scale: 0.9, opacity: 1 }}
            animate={{ scale: [1, 1.4], opacity: 0, rotate: [-2, 2, -2, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            aria-hidden
            className="absolute inset-0 inline-flex items-center justify-center text-sky-300 text-xs"
          >
            ◇
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
