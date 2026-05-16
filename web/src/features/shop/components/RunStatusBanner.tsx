// RunStatusBanner — the persistent header on ShopPage that telegraphs every
// progression-shaped piece of state: which day you're on, how much run HP
// you have, gold (with next-day preview), and shop level + XP progress.
// Action buttons (Start Combat, Abandon) live here too so the banner is the
// single place to read "where am I and what can I do next".

import { motion } from "framer-motion";
import { Coins, Heart, Sparkles, Swords, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  heroName: string;
  runId: number;
  day: number;
  maxDay: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** Gold the player will receive at the start of the next day; 0 means no preview. */
  nextDayGold: number;
  shopLevel: number;
  xp: number;
  /** XP required to level up from `shopLevel`. Null when at max level. */
  xpToLevel: number | null;
  maxShopLevel: number;
  onStartCombat: () => void;
  startingCombat: boolean;
  onAbandon: () => void;
  abandoning: boolean;
};

export function RunStatusBanner({
  heroName,
  runId,
  day,
  maxDay,
  hp,
  maxHp,
  gold,
  nextDayGold,
  shopLevel,
  xp,
  xpToLevel,
  maxShopLevel,
  onStartCombat,
  startingCombat,
  onAbandon,
  abandoning,
}: Props) {
  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(maxHp, 1)) * 100));
  const hpTone = hpPct > 60 ? "bg-emerald-500" : hpPct > 30 ? "bg-amber-400" : "bg-rose-500";

  const atMaxLevel = shopLevel >= maxShopLevel;
  const xpPct = atMaxLevel || xpToLevel === null ? 100 : Math.min(100, (xp / xpToLevel) * 100);

  return (
    <header className="grid gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-5 py-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-amber-400" />
        <div>
          <p className="font-semibold text-lg leading-tight">{heroName}</p>
          <p className="text-slate-400 text-xs uppercase tracking-wider">Run #{runId}</p>
        </div>
      </div>

      <DayIndicator day={day} maxDay={maxDay} />

      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex w-44 flex-col gap-1">
          <div className="flex items-baseline justify-between text-slate-300 text-xs uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5 text-rose-400" />
              HP
            </span>
            <span className="font-mono text-slate-100 text-sm">
              {hp}
              <span className="text-slate-500">/{maxHp}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className={cn("h-full rounded-full", hpTone)}
              initial={false}
              animate={{ width: `${hpPct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="flex w-40 flex-col gap-1">
          <div className="flex items-baseline justify-between text-slate-300 text-xs uppercase tracking-wider">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              Shop Lv {shopLevel}
            </span>
            <span className="font-mono text-slate-100 text-sm">
              {atMaxLevel ? "MAX" : `${xp}/${xpToLevel}`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-emerald-500"
              initial={false}
              animate={{ width: `${xpPct}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 text-sm">
          <div className="flex items-center gap-1.5">
            <Coins className="h-4 w-4 text-amber-300" />
            <span className="font-mono text-base">{gold}</span>
            <span className="text-slate-500 text-xs uppercase tracking-wider">gold</span>
          </div>
          {nextDayGold > 0 ? (
            <p className="text-amber-300/70 text-xs">+{nextDayGold} next day</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onStartCombat}
            disabled={startingCombat}
            className="flex items-center gap-1.5 rounded-md border border-amber-600 bg-amber-500/10 px-3 py-1.5 font-medium text-amber-100 text-sm hover:bg-amber-500/20 disabled:opacity-50"
          >
            <Swords className="h-4 w-4" />
            {startingCombat ? "Starting…" : "Start Combat"}
          </button>
          <button
            type="button"
            onClick={onAbandon}
            disabled={abandoning}
            className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-1 text-rose-200 text-xs hover:bg-rose-900/40 disabled:opacity-50"
          >
            {abandoning ? "Abandoning…" : "Abandon"}
          </button>
        </div>
      </div>
    </header>
  );
}

function DayIndicator({ day, maxDay }: { day: number; maxDay: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-slate-400 text-xs uppercase tracking-widest">Day</p>
      <p className="font-bold font-mono text-3xl leading-none text-amber-200">
        {day}
        <span className="text-slate-500 text-xl">/{maxDay}</span>
      </p>
      <div className="flex gap-1">
        {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
          <span
            key={d}
            className={cn(
              "h-1.5 w-3 rounded-full transition-colors",
              d < day && "bg-emerald-600",
              d === day && "bg-amber-400",
              d > day && "bg-slate-700",
            )}
          />
        ))}
      </div>
    </div>
  );
}
