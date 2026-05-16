// CombatPage — plays the deterministic tick log returned by
// POST /api/runs/active/combat/start.
//
// Phase 5 contract: no Framer Motion animations yet. Both boards render
// frozen at tick 0; a 100 ms timer walks ticks forward, displaying the
// events for the current tick as plain text overlays ("X fires",
// "opponent takes 5"). When the last tick plays, transition to /run/results.
//
// State recovery: if the page is hit on refresh, the combat response is
// already persisted in runStore (sessionStorage). If somehow missing, we
// fetch GET /api/runs/active/combat/result as a fallback.

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getCombatResult } from "@/api/combat";
import { useItemIndex } from "@/hooks/useCatalog";
import { cn } from "@/lib/cn";
import { useRunStore } from "@/store/runStore";
import type { BoardItem, CombatResponse, Item, TickEvent } from "@/types/game";

const TICK_MS = 100;
// Hold on the final tick before navigating to results so the player can read
// the final state instead of getting whisked away mid-frame.
const POST_TICK_HOLD_MS = 600;

export default function CombatPage() {
  const navigate = useNavigate();
  const combat = useRunStore((s) => s.combat);
  const setCombat = useRunStore((s) => s.setCombat);
  const setPhase = useRunStore((s) => s.setPhase);

  // Recovery path: if the store is empty (server-side restart, manual cache
  // wipe, etc.) fall back to the persisted encounter.
  const recovery = useQuery({
    queryKey: ["combat", "result"] as const,
    queryFn: ({ signal }) => getCombatResult(signal),
    enabled: combat === null,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (combat === null && recovery.data) {
      setCombat(recovery.data);
    }
  }, [combat, recovery.data, setCombat]);

  // If nothing to play (e.g. user typed /run/combat manually with a stale
  // store and no encounter on the server), kick back to the shop phase.
  useEffect(() => {
    if (combat === null && !recovery.isLoading && recovery.data === null) {
      setPhase("shop");
      navigate("/run", { replace: true });
    }
  }, [combat, recovery.isLoading, recovery.data, setPhase, navigate]);

  if (!combat) return <CombatSkeleton />;

  return (
    <CombatPlayer
      combat={combat}
      onDone={() => {
        setPhase("results");
        navigate("/run/results");
      }}
    />
  );
}

function CombatPlayer({ combat, onDone }: { combat: CombatResponse; onDone: () => void }) {
  const itemIndex = useItemIndex();
  const ticks = combat.result.ticks;
  const maxTick = useMemo(() => ticks.reduce((m, e) => (e.tick > m ? e.tick : m), 0), [ticks]);

  // currentTick walks from 0 to maxTick (inclusive) at TICK_MS each.
  const [currentTick, setCurrentTick] = useState(0);

  useEffect(() => {
    if (currentTick >= maxTick) {
      const t = setTimeout(onDone, POST_TICK_HOLD_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCurrentTick((c) => c + 1), TICK_MS);
    return () => clearTimeout(t);
  }, [currentTick, maxTick, onDone]);

  // Derive HP at the current tick by replaying damage events up to (and
  // including) the current tick. Phase 5 ticks are flat enough that this
  // O(N) replay is cheap.
  const { playerHp, opponentHp } = useMemo(
    () => replayHp(combat, currentTick),
    [combat, currentTick],
  );

  const currentEvents = ticks.filter((e) => e.tick === currentTick);

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 bg-slate-950 px-6 py-10 text-slate-50">
      <header className="flex flex-col items-center gap-1">
        <p className="text-slate-400 text-xs uppercase tracking-widest">
          Day {combat.day} · Combat
        </p>
        <p className="text-slate-500 text-xs">
          tick {currentTick} / {maxTick}
        </p>
      </header>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        <CombatantPanel
          label="You"
          accent="border-amber-700/60 bg-amber-950/30"
          hpAccent="bg-amber-400"
          board={combat.playerBoard}
          itemIndex={itemIndex}
          hp={playerHp}
          startHp={combat.result.playerStartHp}
        />
        <CombatantPanel
          label="Opponent"
          accent="border-rose-700/60 bg-rose-950/30"
          hpAccent="bg-rose-400"
          board={combat.opponentBoard}
          itemIndex={itemIndex}
          hp={opponentHp}
          startHp={combat.result.opponentStartHp}
        />
      </div>

      <div
        className="flex h-24 w-full max-w-lg flex-col items-center justify-center gap-1 rounded-md border border-slate-800 bg-slate-900/60 px-4 py-3 font-mono text-sm"
        role="log"
        aria-live="polite"
      >
        {currentEvents.length === 0 ? (
          <p className="text-slate-500">…</p>
        ) : (
          currentEvents.map((ev) => (
            <p
              key={`${ev.tick}:${ev.type}:${ev.source ?? ""}:${ev.target ?? ""}:${ev.value ?? ""}`}
              className="text-slate-200"
            >
              {formatEvent(ev, itemIndex)}
            </p>
          ))
        )}
      </div>
    </main>
  );
}

function CombatantPanel({
  label,
  accent,
  hpAccent,
  board,
  itemIndex,
  hp,
  startHp,
}: {
  label: string;
  accent: string;
  hpAccent: string;
  board: BoardItem[];
  itemIndex: Record<string, Item>;
  hp: number;
  startHp: number;
}) {
  const pct = startHp > 0 ? Math.max(0, Math.min(100, (hp / startHp) * 100)) : 0;
  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border p-4", accent)}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-lg">{label}</h3>
        <span className="font-mono text-slate-300 text-sm">
          {Math.max(0, hp)} / {startHp} hp
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={cn("h-full transition-[width] duration-100", hpAccent)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="flex flex-wrap gap-2">
        {board.length === 0 ? (
          <li className="text-slate-500 text-sm italic">empty board</li>
        ) : (
          board.map((b) => {
            const def = itemIndex[b.itemId];
            return (
              <li
                key={`${b.slot}-${b.itemId}`}
                className="rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs"
              >
                {def?.name ?? b.itemId}
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

function CombatSkeleton() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
      <p className="text-sm">Loading combat…</p>
    </main>
  );
}

// replayHp walks the tick log up to (and including) cutoffTick, accumulating
// damage and heal events. Other state effects (shield, status) will join the
// switch in later phases.
function replayHp(combat: CombatResponse, cutoffTick: number) {
  let playerHp = combat.result.playerStartHp;
  let opponentHp = combat.result.opponentStartHp;
  for (const ev of combat.result.ticks) {
    if (ev.tick > cutoffTick) break;
    if (!ev.value) continue;
    if (ev.type === "damage") {
      if (ev.target === "player") playerHp -= ev.value;
      else if (ev.target === "opponent") opponentHp -= ev.value;
    } else if (ev.type === "heal") {
      if (ev.target === "player") playerHp += ev.value;
      else if (ev.target === "opponent") opponentHp += ev.value;
    }
  }
  return { playerHp, opponentHp };
}

function formatEvent(ev: TickEvent, itemIndex: Record<string, Item>): string {
  const sourceName = (s: string | undefined): string => {
    if (!s) return "";
    const [, itemId] = s.split(":");
    if (!itemId) return s;
    return itemIndex[itemId]?.name ?? itemId;
  };
  switch (ev.type) {
    case "fight_start":
      return "Fight!";
    case "fight_end":
      return "—";
    case "item_fired":
      return `${sourceName(ev.source)} fires`;
    case "damage":
      return `${ev.target ?? "?"} takes ${ev.value ?? 0} damage`;
    case "heal":
      return `${ev.target ?? "?"} heals ${ev.value ?? 0}`;
    case "death":
      return `${ev.target ?? "?"} is defeated`;
    default:
      return ev.type;
  }
}
