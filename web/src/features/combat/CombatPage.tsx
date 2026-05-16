// CombatPage — plays the deterministic tick log returned by
// POST /api/runs/active/combat/start.
//
// Phase 8 + 11: animated playback. useReplay owns tick advancement; health
// bars tween, damage numbers float up, items pulse when they fire, defeated
// sides fade out via AnimatePresence. Shield + status visuals, speed
// controls, and a seek bar all land in phase 11.
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
import { ShieldBubble } from "@/features/combat/components/ShieldBubble";
import { type StatusEntry, StatusIcons } from "@/features/combat/components/StatusIcons";
import { useItemIndex } from "@/hooks/useCatalog";
import { useReplay } from "@/lib/combat/sequencer";
import { cn } from "@/lib/cn";
import { useRunStore } from "@/store/runStore";
import type { BoardItem, CombatResponse, Item, TickEvent } from "@/types/game";

// Hold on the final tick before navigating to results so the player can read
// the final state instead of getting whisked away mid-frame.
const POST_TICK_HOLD_MS = 800;

// How long a floating damage / heal / status drip number stays mounted after
// its tick. Has to outlast the 600ms popup animation so AnimatePresence
// doesn't cut it off.
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
  const { currentTick, maxTick, status, speed } = state;

  // Derive HP / shield / statuses at the current tick by replaying every
  // state-bearing event up to (and including) the current tick. O(N) — fine
  // for ≤300 ticks.
  const derived = useMemo(() => replayDerived(combat, currentTick), [combat, currentTick]);
  const { playerHp, opponentHp, playerShield, opponentShield, playerStatuses, opponentStatuses } =
    derived;

  const eventsByTick = useMemo(() => groupByTick(ticks), [ticks]);
  const currentEvents = eventsByTick.get(currentTick) ?? [];

  // Damage / heal / status_tick numbers outlive a single tick — at 1x speed
  // each tick is only 100ms but the popup animation runs for 600ms. Buffer
  // recent events and expire them via setTimeout so AnimatePresence has
  // enough runway.
  const [activeDamage, setActiveDamage] = useState<ActiveDmg[]>([]);
  useEffect(() => {
    const fresh: ActiveDmg[] = [];
    currentEvents.forEach((ev, i) => {
      const isFloater =
        ev.type === "damage" ||
        ev.type === "heal" ||
        (ev.type === "status_tick" && (ev.source === "poison" || ev.source === "burn"));
      if (!isFloater) return;
      if (ev.target !== "player" && ev.target !== "opponent") return;
      fresh.push({
        id: `${currentTick}:${i}:${ev.target}:${ev.value}:${ev.type}:${ev.source ?? ""}`,
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

  const buffedItems = useMemo(() => {
    const set = new Set<string>();
    for (const ev of currentEvents) {
      if (ev.type === "buff_applied" && ev.target) set.add(ev.target);
      if (ev.type === "status_applied" && ev.target?.includes(":")) set.add(ev.target);
    }
    return set;
  }, [currentEvents]);

  // Shield bubble keys: bump on every shield_applied/broken so the bubble
  // re-pulses. Break key is null on ticks with no break event so the
  // overlay animation only fires once.
  const shieldKeys = useMemo(
    () => deriveShieldKeys(currentEvents, currentTick),
    [currentEvents, currentTick],
  );

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
          shield={playerShield}
          statuses={playerStatuses}
          shieldPulseKey={shieldKeys.player.pulse}
          shieldBreakKey={shieldKeys.player.brk}
          firing={firingItems}
          buffed={buffedItems}
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
          shield={opponentShield}
          statuses={opponentStatuses}
          shieldPulseKey={shieldKeys.opponent.pulse}
          shieldBreakKey={shieldKeys.opponent.brk}
          firing={firingItems}
          buffed={buffedItems}
          dmgEvents={opponentDamage}
          dead={opponentDead}
          currentTick={currentTick}
        />
      </div>

      <PlaybackControls
        status={status}
        currentTick={currentTick}
        maxTick={maxTick}
        speed={speed}
        onPlay={() => dispatch({ type: "PLAY" })}
        onPause={() => dispatch({ type: "PAUSE" })}
        onReset={() => dispatch({ type: "RESET" })}
        onSkip={() => dispatch({ type: "SEEK", tick: maxTick })}
        onSeek={(tick) => dispatch({ type: "SEEK", tick })}
        onSetSpeed={(s) => dispatch({ type: "SET_SPEED", speed: s })}
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
  shield,
  statuses,
  shieldPulseKey,
  shieldBreakKey,
  firing,
  buffed,
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
  shield: number;
  statuses: StatusEntry[];
  shieldPulseKey: string;
  shieldBreakKey: string | null;
  firing: Set<string>;
  buffed: Set<string>;
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

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-lg">{label}</h3>
        <div className="flex items-center gap-2">
          <ShieldBubble shield={shield} pulseKey={shieldPulseKey} breakKey={shieldBreakKey} />
          <span className="font-mono text-slate-300 text-xs">
            {Math.max(0, hp)} / {startHp} hp
          </span>
        </div>
      </div>

      <HealthBar hp={hp} startHp={startHp} accent={hpAccent} />

      <StatusIcons entries={statuses} pulseKey={shieldPulseKey} />

      <ul className="flex flex-wrap gap-2 pt-1">
        {board.length === 0 ? (
          <li className="text-slate-500 text-sm italic">empty board</li>
        ) : (
          <AnimatePresence initial={false}>
            {board.map((b) => {
              const def = itemIndex[b.itemId];
              const tag = `${side}:${b.itemId}`;
              const isFiring = firing.has(tag);
              const isBuffed = buffed.has(tag);
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
                        isBuffed && "border-emerald-400/70 shadow-emerald-500/30 shadow-sm",
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

type DerivedCombatState = {
  playerHp: number;
  opponentHp: number;
  playerShield: number;
  opponentShield: number;
  playerStatuses: StatusEntry[];
  opponentStatuses: StatusEntry[];
};

// replayDerived walks the tick log up to (and including) cutoffTick,
// accumulating damage / heal / shield / status events. Shield absorbs damage
// first (mirrors the engine's absorbWithShield); status_applied bumps the
// stack count, status_tick is a side-scoped damage so it's folded into HP /
// shield via the same routing.
function replayDerived(combat: CombatResponse, cutoffTick: number): DerivedCombatState {
  let playerHp = combat.result.playerStartHp;
  let opponentHp = combat.result.opponentStartHp;
  let playerShield = 0;
  let opponentShield = 0;
  const playerStatuses = new Map<string, number>();
  const opponentStatuses = new Map<string, number>();

  const applyDmg = (side: "player" | "opponent", value: number) => {
    if (side === "player") {
      const absorbed = Math.min(playerShield, value);
      playerShield -= absorbed;
      playerHp -= value - absorbed;
    } else {
      const absorbed = Math.min(opponentShield, value);
      opponentShield -= absorbed;
      opponentHp -= value - absorbed;
    }
  };

  for (const ev of combat.result.ticks) {
    if (ev.tick > cutoffTick) break;
    const target = ev.target;
    const value = ev.value ?? 0;
    switch (ev.type) {
      case "damage":
        if (target === "player" || target === "opponent") applyDmg(target, value);
        break;
      case "heal":
        if (target === "player") playerHp += value;
        else if (target === "opponent") opponentHp += value;
        break;
      case "shield_applied":
        if (target === "player") playerShield += value;
        else if (target === "opponent") opponentShield += value;
        break;
      case "shield_broken":
        if (target === "player") playerShield = 0;
        else if (target === "opponent") opponentShield = 0;
        break;
      case "status_applied": {
        // Side-scoped applies (poison/burn) use a bare "player"/"opponent"
        // target; item-scoped applies (freeze/haste) carry "side:item_id".
        if (target !== "player" && target !== "opponent") break;
        const kind = ev.source;
        if (kind !== "poison" && kind !== "burn") break;
        const bag = target === "player" ? playerStatuses : opponentStatuses;
        bag.set(kind, (bag.get(kind) ?? 0) + value);
        break;
      }
      case "status_tick": {
        // status_tick is the engine's authoritative DoT event — it carries
        // the damage in `value` and is the *only* event emitted for that
        // chip damage (no separate "damage" event). Poison bypasses shield;
        // burn eats shield first (shield_broken is emitted separately when
        // the shield depletes). Also decrement the stack to mirror the
        // engine's post-application `s.Stacks--`.
        if (target !== "player" && target !== "opponent") break;
        const kind = ev.source;
        if (kind !== "poison" && kind !== "burn") break;
        if (kind === "burn") {
          applyDmg(target, value);
        } else if (target === "player") {
          playerHp -= value;
        } else {
          opponentHp -= value;
        }
        const bag = target === "player" ? playerStatuses : opponentStatuses;
        const cur = bag.get(kind) ?? 0;
        if (cur <= 1) bag.delete(kind);
        else bag.set(kind, cur - 1);
        break;
      }
    }
  }

  const toEntries = (m: Map<string, number>): StatusEntry[] =>
    Array.from(m.entries())
      .filter(([, n]) => n > 0)
      .map(([kind, stacks]) => ({ kind: kind as StatusEntry["kind"], stacks }));

  return {
    playerHp,
    opponentHp,
    playerShield: Math.max(0, playerShield),
    opponentShield: Math.max(0, opponentShield),
    playerStatuses: toEntries(playerStatuses),
    opponentStatuses: toEntries(opponentStatuses),
  };
}

// deriveShieldKeys produces per-side keys for the shield bubble pulse +
// break-burst overlays. The pulse key changes whenever an apply / tick event
// affects this side so the bubble re-animates; the break key is non-null only
// on ticks where a shield_broken event fires.
function deriveShieldKeys(events: TickEvent[], tick: number) {
  let playerPulse = `player:rest`;
  let opponentPulse = `opponent:rest`;
  let playerBreak: string | null = null;
  let opponentBreak: string | null = null;
  for (const ev of events) {
    if (ev.type === "shield_applied" || ev.type === "status_applied" || ev.type === "status_tick") {
      if (ev.target === "player") playerPulse = `player:${tick}:${ev.type}`;
      else if (ev.target === "opponent") opponentPulse = `opponent:${tick}:${ev.type}`;
    } else if (ev.type === "shield_broken") {
      if (ev.target === "player") playerBreak = `player:${tick}`;
      else if (ev.target === "opponent") opponentBreak = `opponent:${tick}`;
    }
  }
  return {
    player: { pulse: playerPulse, brk: playerBreak },
    opponent: { pulse: opponentPulse, brk: opponentBreak },
  };
}
