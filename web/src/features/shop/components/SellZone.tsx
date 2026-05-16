// Dedicated sell-zone drop target. Only items currently owned by the player
// (hand or board) can be sold; the ShopPage drag handler routes invalid
// shop→sell drops to a no-op.

import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { cn } from "@/lib/cn";
import { SELL_DROP_ID } from "../dnd";

type Props = {
  /** When true the zone fades in (drag in progress). */
  active: boolean;
};

export function SellZone({ active }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: SELL_DROP_ID,
    data: { kind: "sell" },
  });

  return (
    <motion.div
      ref={setNodeRef}
      initial={false}
      animate={{ opacity: active ? 1 : 0.35, scale: active ? 1 : 0.97 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 font-semibold text-sm transition-colors",
        isOver
          ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
          : "border-rose-700/70 bg-rose-950/40 text-rose-200",
      )}
      aria-label="Sell zone"
    >
      <Coins className="h-4 w-4" />
      <span>Drop here to sell</span>
    </motion.div>
  );
}
