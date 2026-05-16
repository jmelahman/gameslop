// ResultsPage — what the player sees after CombatPage finishes the tick log.
// Phase 5 ships a minimal banner + two actions:
//   - Continue: advance to the next day (back to /run), or return to the
//     start menu when the run terminated (final win or loss).
//   - Abandon: DELETE /api/runs/active, clear local state, back to menu.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Coins, Heart, Sparkles, Swords, Trophy } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "@/api/client";
import { abandonRun, getRunHistory, type RunHistoryEntry } from "@/api/runs";
import { RUN_QUERY_KEY } from "@/hooks/useRun";
import { cn } from "@/lib/cn";
import { MAX_DAY } from "@/lib/progression";
import { useRunStore } from "@/store/runStore";
import type { CombatOutcome, RunStatus } from "@/types/game";

export default function ResultsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const combat = useRunStore((s) => s.combat);
  const setPhase = useRunStore((s) => s.setPhase);
  const setCombat = useRunStore((s) => s.setCombat);
  const clearRun = useRunStore((s) => s.clearRun);

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

  if (!combat) return null;

  const banner = bannerFor(combat.result.outcome, combat.ended, combat.finalOutcome);
  const hpDelta = combat.result.playerEndHp - combat.result.playerStartHp;
  const isFinalWin = combat.ended && combat.finalOutcome === "won";
  const isFinalLoss = combat.ended && combat.finalOutcome === "lost";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 py-12 text-slate-50">
      {isFinalWin ? <WinFanfare /> : null}

      <motion.header
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <p className="text-slate-400 text-xs uppercase tracking-widest">
          Day {combat.day}
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

      <section className="grid w-full max-w-md grid-cols-3 gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-5">
        <Stat
          icon={<Heart className="h-4 w-4 text-rose-400" />}
          label="fight hp left"
          value={Math.max(0, combat.result.playerEndHp)}
        />
        <Stat
          icon={<Swords className="h-4 w-4 text-amber-300" />}
          label="hp lost"
          value={Math.max(0, -hpDelta)}
        />
        <Stat
          icon={<Coins className="h-4 w-4 text-amber-300" />}
          label="run gold"
          value={combat.run?.state.gold ?? 0}
        />
      </section>

      {combat.ended ? <RunHistoryTable /> : null}

      <div className="flex w-full max-w-md flex-col gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md border border-amber-600 bg-amber-500/10 px-6 py-3 font-medium tracking-wide text-amber-100 transition-colors hover:bg-amber-500/20"
        >
          {combat.ended ? "Back to menu" : "Continue"}
        </button>
        {!combat.ended ? (
          <button
            type="button"
            onClick={() => abandon.mutate()}
            disabled={abandon.isPending}
            className="rounded-md border border-rose-800 bg-rose-950/40 px-4 py-2 text-rose-200 text-sm hover:bg-rose-900/40 disabled:opacity-50"
          >
            {abandon.isPending ? "Abandoning…" : "Abandon run"}
          </button>
        ) : null}
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

function RunHistoryTable() {
  const { data, isLoading } = useQuery<RunHistoryEntry[]>({
    queryKey: ["run-history"],
    queryFn: () => getRunHistory(5),
    staleTime: 0,
  });

  if (isLoading) {
    return <p className="text-slate-500 text-xs uppercase tracking-wider">Loading history…</p>;
  }
  const rows = data ?? [];
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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        {icon}
        <span className="font-mono text-lg">{value}</span>
      </div>
      <span className="text-slate-500 text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}
