import type { Variants } from "framer-motion";

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export const stagger = (staggerChildren = 0.08, delayChildren = 0.1): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren, delayChildren } },
});

// pulseScale — quick punch animation used when a combat item activates. Plays
// once over 300ms; consumers re-key the wrapper to re-trigger.
export const pulseScale: Variants = {
  rest: { scale: 1 },
  pulse: {
    scale: [1, 1.08, 1],
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// dmgPopup — floating damage number. Numbers spawn at the target, drift up
// 40px, and fade out over 600ms.
export const dmgPopup: Variants = {
  hidden: { opacity: 0, y: 0, scale: 0.7 },
  visible: {
    opacity: [0, 1, 1, 0],
    y: [0, -10, -28, -40],
    scale: [0.7, 1.1, 1, 1],
    transition: { duration: 0.6, ease: "easeOut", times: [0, 0.15, 0.6, 1] },
  },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
