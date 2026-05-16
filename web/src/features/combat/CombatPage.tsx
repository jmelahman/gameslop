// CombatPage — plays the deterministic tick log returned by
// POST /api/runs/active/combat/start.
//
// Phase 8: animated playback. useReplay owns tick advancement; health bars
// tween, damage numbers float up, items pulse when they fire, defeated
// sides fade out via AnimatePresence. PlaybackControls expose play/pause/
// reset. Shield + status visuals + speed controls + seek bar all land in
// phase 11.
//
// State recovery: if the page is hit on refresh, the combat response is
// already persisted in runStore (sessionStorage). If somehow missing, we
// fetch GET /api/runs/active/combat/result as a fallback.

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getCombatResult } from "@/api/combat";
import { type DamageEntry, DamageNumber } from "@/features/combat/components/DamageNumber";
import { HealthBar } from "@/features/combat/components/HealthBar";
import { ItemFireOverlay } from "@/features/combat/components/ItemFireOverlay";
import { PlaybackControls } from "@/features/combat/components/PlaybackControls";
import { useItemIndex } from "@/hooks/useCatalog";
import { useReplay } from "@/lib/combat/sequencer";
import { cn } from "@/lib/cn";
import { useRunStore } from "@/store/runStore";
import type { BoardItem, CombatResponse, Item, TickEvent } from "@/types/game";

// Hold on the final tick before navigating to results so the player can read
// the final state instead of getting whisked away mid-frame.
const POST_TICK_HOLD_MS = 800;

// How long a floating damage number stays mounted after its tick. Has to
// outlast the 600ms popup animation so AnimatePresence doesn't cut it off.
const DMG_WINDOW_MS = 700;

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
  const { state, dispatch } = useReplay(ticks);
  const { currentTick, maxTick, status } = state;

  // Derive HP at the current tick by replaying damage/heal events up to (and
  // including) the current tick. O(N) — fine for ≤300 ticks.
  const { playerHp, opponentHp } = useMemo(
    () => replayHp(combat, currentTick),
    [combat, currentTick],
  );

  const eventsByTick = useMemo(() => groupByTick(ticks), [ticks]);
  const currentEvents = eventsByTick.get(currentTick) ?? [];

  // Damage / heal numbers outlive a single tick — at 1x speed each tick is
  // only 100ms but the popup animation runs for 600ms. Buffer recent events
  // and expire them via setTimeout so AnimatePresence has enough runway.
  const [activeDamage, setActiveDamage] = useState<ActiveDmg[]>([]);
  useEffect(() => {
    const fresh: ActiveDmg[] = [];
    currentEvents.forEach((ev, i) => {
      if (ev.type !== "damage" && ev.type !== "heal") return;
      if (ev.target !== "player" && ev.target !== "opponent") return;
      fresh.push({
        id: `${currentTick}:${i}:${ev.target}:${ev.value}:${ev.type}`,
        tick: currentTick,
        side: ev.target,
        event: ev,
      });
    });
    if (fresh.length === 0) return;
    setActiveDamage((prev) => [...prev, ...fresh]);
    const ids = new Set(fresh.map((f) => f.id));
    const t = setTimeout(() => {
      setActiveDamage((prev) => prev.filter((d) => !ids.has(d.id)));
    }, DMG_WINDOW_MS);
    return () => clearTimeout(t);
  }, [currentTick, currentEvents]);

  // Wipe damage stack on reset / replay so old numbers don't bleed into a
  // re-played fight.
  useEffect(() => {
    if (currentTick === 0) setActiveDamage([]);
  }, [currentTick]);

  const playerDamage = activeDamage
    .filter((d) => d.side === "player")
    .map((d) => ({ id: d.id, event: d.event }));
  const opponentDamage = activeDamage
    .filter((d) => d.side === "opponent")
    .map((d) => ({ id: d.id, event: d.event }));

  const firingItems = useMemo(() => {
    const set = new Set<string>();
    for (const ev of currentEvents) {
      if (ev.type === "item_fired" && ev.source) set.add(ev.source);
    }
    return set;
  }, [currentEvents]);

  // Once playback hits "ended", hold briefly so the final HP / death anim
  // can settle, then transition to /run/results.
  useEffect(() => {
    if (status !== "ended") return;
    const t = setTimeout(onDone, POST_TICK_HOLD_MS);
    return () => clearTimeout(t);
  }, [status, onDone]);

  const playerDead = playerHp <= 0;
  const opponentDead = opponentHp <= 0;

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
          side="player"
          label="You"
          accent="border-amber-700/60 bg-amber-950/30"
          hpAccent="bg-amber-400"
          board={combat.playerBoard}
          itemIndex={itemIndex}
          hp={playerHp}
          startHp={combat.result.playerStartHp}
          firing={firingItems}
          dmgEvents={playerDamage}
          dead={playerDead}
          currentTick={currentTick}
        />
        <CombatantPanel
          side="opponent"
          label="Opponent"
          accent="border-rose-700/60 bg-rose-950/30"
          hpAccent="bg-rose-400"
          board={combat.opponentBoard}
          itemIndex={itemIndex}
          hp={opponentHp}
          startHp={combat.result.opponentStartHp}
          firing={firingItems}
          dmgEvents={opponentDamage}
          dead={opponentDead}
          currentTick={currentTick}
        />
      </div>

      <PlaybackControls
        status={status}
        onPlay={() => dispatch({ type: "PLAY" })}
        onPause={() => dispatch({ type: "PAUSE" })}
        onReset={() => dispatch({ type: "RESET" })}
      />
    </main>
  );
}

function CombatantPanel({
  side,
  label,
  accent,
  hpAccent,
  board,
  itemIndex,
  hp,
  startHp,
  firing,
  dmgEvents,
  dead,
  currentTick,
}: {
  side: "player" | "opponent";
  label: string;
  accent: string;
  hpAccent: string;
  board: BoardItem[];
  itemIndex: Record<string, Item>;
  hp: number;
  startHp: number;
  firing: Set<string>;
  dmgEvents: DamageEntry[];
  dead: boolean;
  currentTick: number;
}) {
  return (
    <motion.section
      className={cn("relative flex flex-col gap-3 rounded-lg border p-4", accent)}
      animate={{
        opacity: dead ? 0.45 : 1,
        filter: dead ? "grayscale(70%)" : "grayscale(0%)",
      }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <DamageNumber entries={dmgEvents} />

      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-lg">{label}</h3>
        <span className="font-mono text-slate-300 text-xs">
          {Math.max(0, hp)} / {startHp} hp
        </span>
      </div>

      <HealthBar hp={hp} startHp={startHp} accent={hpAccent} />

      <ul className="flex flex-wrap gap-2 pt-1">
        {board.length === 0 ? (
          <li className="text-slate-500 text-sm italic">empty board</li>
        ) : (
          <AnimatePresence initial={false}>
            {board.map((b) => {
              const def = itemIndex[b.itemId];
              const tag = `${side}:${b.itemId}`;
              const isFiring = firing.has(tag);
              return (
                <motion.li
                  key={`${b.slot}-${b.itemId}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.25 }}
                >
                  <ItemFireOverlay
                    fireKey={`${tag}:${isFiring ? currentTick : "rest"}`}
                    firing={isFiring}
                  >
                    <div
                      className={cn(
                        "rounded border border-slate-700 bg-slate-900/80 px-2 py-1 text-xs",
                        isFiring && "border-amber-400/70",
                      )}
                    >
                      {def?.name ?? b.itemId}
                    </div>
                  </ItemFireOverlay>
                </motion.li>
              );
            })}
          </AnimatePresence>
        )}
      </ul>
    </motion.section>
  );
}

function CombatSkeleton() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
      <p className="text-sm">Loading combat…</p>
    </main>
  );
}

// ActiveDmg is one entry in the damage-number window. We carry the side
// separately from the event so DamageNumber doesn't have to re-route.
type ActiveDmg = {
  id: string;
  tick: number;
  side: "player" | "opponent";
  event: TickEvent;
};

function groupByTick(ticks: TickEvent[]): Map<number, TickEvent[]> {
  const m = new Map<number, TickEvent[]>();
  for (const ev of ticks) {
    const bucket = m.get(ev.tick);
    if (bucket) bucket.push(ev);
    else m.set(ev.tick, [ev]);
  }
  return m;
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
