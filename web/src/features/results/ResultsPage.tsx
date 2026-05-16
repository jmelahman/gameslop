// ResultsPage — what the player sees after CombatPage finishes the tick log.
//
// Phase 13 surface:
//   - Outcome banner (win / loss / tie + final-run win/loss callouts).
//   - Day counter (days survived this run).
//   - Stat grid: damage dealt, damage taken, items fired, gold on hand, hp.
//   - Final board snapshot — the player's board exactly as it went into
//     combat, with tier coloring.
//   - Recent runs strip (loaded from /api/runs/history).
//   - Continue / Abandon / View stats actions.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  Coins,
  Heart,
  Package,
  Shield,
  Sparkles,
  Sword,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "@/api/client";
import { abandonRun, getRunHistory, type RunHistoryEntry, type RunHistoryPage } from "@/api/runs";
import { ItemCard } from "@/components/game/ItemCard";
import { useItemIndex } from "@/hooks/useCatalog";
import { RUN_QUERY_KEY } from "@/hooks/useRun";
import { cn } from "@/lib/cn";
import { summarizeFight } from "@/lib/combat/stats";
import { MAX_DAY } from "@/lib/progression";
import { useRunStore } from "@/store/runStore";
import type { BoardItem, CombatOutcome, Item, RunStatus } from "@/types/game";

// Sound effect stubs — Phase 13 lays the call sites; real audio assets land
// later. Keeping these as commented Audio() invocations means the wiring is
// in place at the right code path without shipping silent files.
//
// TODO(audio): play sfx/victory.wav on win, sfx/defeat.wav on loss,
// sfx/draw.wav on tie. e.g. `new Audio("/sfx/victory.wav").play()`.

export default function ResultsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const combat = useRunStore((s) => s.combat);
  const setPhase = useRunStore((s) => s.setPhase);
  const setCombat = useRunStore((s) => s.setCombat);
  const clearRun = useRunStore((s) => s.clearRun);
  const itemIndex = useItemIndex();

  // If somebody lands here with no result (manual URL, expired session),
  // bounce back to the shop phase rather than show an empty screen.
  useEffect(() => {
    if (combat === null) {
      setPhase("shop");
      navigate("/run", { replace: true });
    }
  }, [combat, setPhase, navigate]);

  const abandon = useMutation({
    mutationFn: abandonRun,
    onSuccess: () => {
      clearRun();
      qc.removeQueries({ queryKey: RUN_QUERY_KEY });
      navigate("/", { replace: true });
    },
    onError: () => {
      // If the backend already finished the run (ended === true), the DELETE
      // returns 404. Treat that as success — the local run is over anyway.
      clearRun();
      qc.removeQueries({ queryKey: RUN_QUERY_KEY });
      navigate("/", { replace: true });
    },
    throwOnError: false,
  });

  const fightStats = useMemo(() => (combat ? summarizeFight(combat.result.ticks) : null), [combat]);

  if (!combat || !fightStats) return null;

  const banner = bannerFor(combat.result.outcome, combat.ended, combat.finalOutcome);
  const isFinalWin = combat.ended && combat.finalOutcome === "won";
  const isFinalLoss = combat.ended && combat.finalOutcome === "lost";
  const daysSurvived = daysSurvivedFor(combat.day, combat.result.outcome, combat.ended);

  const onContinue = () => {
    if (combat.ended) {
      // Run finished server-side. Clear and go home.
      clearRun();
      qc.removeQueries({ queryKey: RUN_QUERY_KEY });
      navigate("/", { replace: true });
      return;
    }
    setCombat(null);
    setPhase("shop");
    navigate("/run");
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center gap-8 bg-slate-950 px-6 py-12 text-slate-50">
      {isFinalWin ? <WinFanfare /> : null}

      <motion.header
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <p className="text-slate-400 text-xs uppercase tracking-widest">
          Day {combat.day} / {MAX_DAY}
          {isFinalWin ? " · Final" : ""}
          {isFinalLoss ? " · Run end" : ""}
        </p>
        <h2
          className={cn(
            "font-bold text-5xl tracking-wide",
            banner.tone === "win" && "text-emerald-300",
            banner.tone === "loss" && "text-rose-300",
            banner.tone === "tie" && "text-amber-200",
          )}
        >
          {banner.title}
        </h2>
        <p className="text-slate-300 text-sm">{banner.subtitle}</p>
        {isFinalWin ? (
          <p className="mt-1 flex items-center gap-1.5 text-amber-200 text-sm">
            <Trophy className="h-4 w-4" />
            Survived all {MAX_DAY} days
          </p>
        ) : null}
      </motion.header>

      <StatGrid
        daysSurvived={daysSurvived}
        damageDealt={fightStats.damageDealt}
        damageTaken={fightStats.damageTaken}
        healed={fightStats.healed}
        shieldApplied={fightStats.shieldApplied}
        itemsUsed={fightStats.itemsUsed}
        gold={combat.run?.state.gold ?? 0}
        runHp={combat.run?.state.hp ?? null}
      />

      <FinalBoard board={combat.playerBoard} itemIndex={itemIndex} />

      {combat.ended ? <RunHistoryStrip /> : null}

      <div className="flex w-full max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md border border-amber-600 bg-amber-500/10 px-6 py-3 font-medium tracking-wide text-amber-100 transition-colors hover:bg-amber-500/20"
        >
          {combat.ended ? "Back to menu" : "Continue"}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/stats")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-4 py-2 text-slate-200 text-sm hover:border-amber-700 hover:text-amber-200"
          >
            <BarChart3 className="h-4 w-4" /> View stats
          </button>
          {!combat.ended ? (
            <button
              type="button"
              onClick={() => abandon.mutate()}
              disabled={abandon.isPending}
              className="flex-1 rounded-md border border-rose-800 bg-rose-950/40 px-4 py-2 text-rose-200 text-sm hover:bg-rose-900/40 disabled:opacity-50"
            >
              {abandon.isPending ? "Abandoning…" : "Abandon run"}
            </button>
          ) : null}
        </div>
        {abandon.error instanceof ApiError ? (
          <p className="text-rose-300 text-xs">{abandon.error.message}</p>
        ) : null}
      </div>
    </main>
  );
}

const FANFARE_SLOTS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"];

function WinFanfare() {
  return (
    <motion.div
      className="-z-0 pointer-events-none absolute inset-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.2 }}
    >
      {FANFARE_SLOTS.map((slot, i) => (
        <motion.div
          key={slot}
          className="absolute top-1/4 left-1/2 -translate-x-1/2 text-amber-300/40"
          initial={{ scale: 0, rotate: 0 }}
          animate={{
            x: (Math.random() - 0.5) * 600,
            y: (Math.random() - 0.5) * 400,
            rotate: 360,
            scale: [0, 1, 0.6],
            opacity: [0, 1, 0],
          }}
          transition={{ duration: 2.5, delay: i * 0.08, repeat: Infinity, repeatDelay: 1 }}
        >
          <Sparkles className="h-6 w-6" />
        </motion.div>
      ))}
    </motion.div>
  );
}

function StatGrid(props: {
  daysSurvived: number;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  shieldApplied: number;
  itemsUsed: number;
  gold: number;
  runHp: number | null;
}) {
  const tiles = [
    {
      key: "days",
      icon: <Trophy className="h-4 w-4 text-amber-300" />,
      label: "days survived",
      value: `${props.daysSurvived}/${MAX_DAY}`,
    },
    {
      key: "dmg-out",
      icon: <Sword className="h-4 w-4 text-rose-300" />,
      label: "damage dealt",
      value: props.damageDealt,
    },
    {
      key: "dmg-in",
      icon: <Swords className="h-4 w-4 text-rose-400" />,
      label: "damage taken",
      value: props.damageTaken,
    },
    {
      key: "items",
      icon: <Zap className="h-4 w-4 text-amber-200" />,
      label: "items used",
      value: props.itemsUsed,
    },
    {
      key: "shield",
      icon: <Shield className="h-4 w-4 text-cyan-300" />,
      label: "shield applied",
      value: props.shieldApplied,
    },
    {
      key: "heal",
      icon: <Heart className="h-4 w-4 text-emerald-300" />,
      label: "healed",
      value: props.healed,
    },
    {
      key: "gold",
      icon: <Coins className="h-4 w-4 text-amber-300" />,
      label: "run gold",
      value: props.gold,
    },
    ...(props.runHp !== null
      ? [
          {
            key: "run-hp",
            icon: <Heart className="h-4 w-4 text-rose-400" />,
            label: "run hp",
            value: props.runHp,
          },
        ]
      : []),
  ];

  return (
    <section className="grid w-full max-w-2xl grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-5 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.key} className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1">
            {t.icon}
            <span className="font-mono text-lg">{t.value}</span>
          </div>
          <span className="text-slate-500 text-xs uppercase tracking-wider">{t.label}</span>
        </div>
      ))}
    </section>
  );
}

function FinalBoard({ board, itemIndex }: { board: BoardItem[]; itemIndex: Record<string, Item> }) {
  if (board.length === 0) return null;
  return (
    <section className="w-full max-w-2xl">
      <h3 className="mb-2 flex items-center gap-1.5 text-slate-400 text-xs uppercase tracking-wider">
        <Package className="h-3.5 w-3.5" />
        Final board
      </h3>
      <div className="grid grid-cols-10 gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        {board.map((b) => {
          const def = itemIndex[b.itemId];
          if (!def) return null;
          return <ItemCard key={`${b.slot}-${b.itemId}`} item={def} showTooltip={false} />;
        })}
      </div>
    </section>
  );
}

function RunHistoryStrip() {
  const { data, isLoading } = useQuery<RunHistoryPage>({
    queryKey: ["run-history", { limit: 5, offset: 0 }],
    queryFn: () => getRunHistory(5, 0),
    staleTime: 0,
  });

  if (isLoading) {
    return <p className="text-slate-500 text-xs uppercase tracking-wider">Loading history…</p>;
  }
  const rows: RunHistoryEntry[] = data?.entries ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="w-full max-w-md">
      <h3 className="mb-2 text-slate-400 text-xs uppercase tracking-wider">Recent runs</h3>
      <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/40">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span className="capitalize text-slate-200">{r.heroId}</span>
            <span className="font-mono text-slate-400">
              Day {r.daysReached}/{MAX_DAY}
            </span>
            <span
              className={cn(
                "rounded px-2 py-0.5 font-mono text-xs uppercase tracking-wider",
                r.outcome === "won" && "bg-emerald-500/15 text-emerald-300",
                r.outcome === "lost" && "bg-rose-500/15 text-rose-300",
                r.outcome === "abandoned" && "bg-slate-700/40 text-slate-300",
                r.outcome === "active" && "bg-amber-500/15 text-amber-200",
              )}
            >
              {r.outcome}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function bannerFor(
  outcome: CombatOutcome,
  ended: boolean,
  finalOutcome: RunStatus | null,
): { title: string; subtitle: string; tone: "win" | "loss" | "tie" } {
  if (ended && finalOutcome === "won") {
    return { title: "Run Complete!", subtitle: `You survived all ${MAX_DAY} days.`, tone: "win" };
  }
  if (ended && finalOutcome === "lost") {
    return { title: "Defeat", subtitle: "Your run ends here.", tone: "loss" };
  }
  switch (outcome) {
    case "win":
      return { title: "Victory", subtitle: "On to the next day.", tone: "win" };
    case "loss":
      return { title: "Defeat", subtitle: "Lost 20 HP. Onward.", tone: "loss" };
    default:
      return { title: "Draw", subtitle: "Neither side fell.", tone: "tie" };
  }
}

// daysSurvivedFor maps the encounter's day number to a "days survived" stat
// the player intuits as completed days. A win on day N means N days survived;
// a loss on day N counts as N-1 completed days unless they survived the HP
// cost (which still advances them past day N in the engine, but the player
// reads "I made it through" — keep the simple definition since the run page
// already shows current day / max day separately.).
function daysSurvivedFor(day: number, outcome: CombatOutcome, ended: boolean): number {
  if (ended && outcome === "win") return MAX_DAY;
  if (outcome === "win") return day;
  if (outcome === "tie") return day;
  // Loss: still completed (day-1) full days; this fight was the one that hurt.
  return Math.max(0, day - 1);
}
