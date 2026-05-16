// useReplay — React glue around replayReducer. Owns the setInterval that
// dispatches ADVANCE while status is "playing". Pulling this out of the
// component means CombatPage only worries about rendering; tests can target
// the pure reducer.

import { useEffect, useReducer } from "react";
import type { TickEvent } from "@/types/game";
import { initialReplayState, replayReducer } from "./replay";

// Server tick = 100 ms; speed multiplies the playback rate. 1x → 100ms,
// 2x → 50ms, 4x → 25ms.
const BASE_TICK_MS = 100;

export function useReplay(ticks: TickEvent[]) {
  const [state, dispatch] = useReducer(replayReducer, initialReplayState);

  // Re-load whenever the tick log identity changes (new fight).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispatch is stable.
  useEffect(() => {
    dispatch({ type: "LOAD", ticks });
  }, [ticks]);

  // Drive ADVANCE while playing. setInterval resets whenever status or
  // speed changes, so a speed bump or pause takes effect immediately.
  useEffect(() => {
    if (state.status !== "playing") return;
    const stepMs = Math.max(1, Math.round(BASE_TICK_MS / state.speed));
    const id = setInterval(() => dispatch({ type: "ADVANCE" }), stepMs);
    return () => clearInterval(id);
  }, [state.status, state.speed]);

  return { state, dispatch };
}
