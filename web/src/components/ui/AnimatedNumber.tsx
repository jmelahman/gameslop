// AnimatedNumber — counts smoothly between value transitions using a
// Framer Motion `animate()` interpolation. Drives the gold tick (and
// anything else where a sudden snap-to-new-number looks abrupt).

import { animate, type MotionValue, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  value: number;
  durationMs?: number;
  className?: string;
};

export function AnimatedNumber({ value, durationMs = 400, className }: Props) {
  const motionVal = useMotionValue(value);
  const rounded: MotionValue<number> = useTransform(motionVal, (v) => Math.round(v));
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: durationMs / 1000,
      ease: [0.16, 1, 0.3, 1],
    });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, durationMs, motionVal, rounded]);

  return <span className={className}>{display}</span>;
}
