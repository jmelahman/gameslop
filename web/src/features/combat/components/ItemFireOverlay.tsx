// ItemFireOverlay — wraps an item card and pulses it when the item fires on
// the current tick. The `fireKey` prop is what re-triggers the animation: the
// parent bumps it (e.g. by appending `:${tick}`) so re-firing the same item on
// a later tick replays the pulse.

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { pulseScale } from "@/lib/animations";

type Props = {
  children: ReactNode;
  // Unique key for the current fire event. Change to re-trigger the pulse.
  fireKey: string;
  // Whether this item fired on the current tick.
  firing: boolean;
};

export function ItemFireOverlay({ children, fireKey, firing }: Props) {
  return (
    <motion.div
      key={fireKey}
      variants={pulseScale}
      initial="rest"
      animate={firing ? "pulse" : "rest"}
      className="relative"
    >
      {children}
      {firing && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-amber-300/80"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
}
