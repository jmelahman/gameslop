// useReplay — React glue around replayReducer. Owns the setInterval that
// dispatches ADVANCE while status is "playing". Pulling this out of the
// component means CombatPage only worries about rendering; tests can target
// the pure reducer.

import { useEffect, useReducer } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import type { TickEvent } from "@/types/game";
import { initialReplayState, replayReducer } from "./replay";

// Server tick = 100 ms; speed multiplies the playback rate. 1x → 100ms,
// 2x → 50ms, 4x → 25ms.
const BASE_TICK_MS = 100;

export function useReplay(ticks: TickEvent[]) {
  const persistedSpeed = useSettingsStore((s) => s.playbackSpeed);
  const setPersistedSpeed = useSettingsStore((s) => s.setPlaybackSpeed);
  const [state, dispatch] = useReducer(replayReducer, initialReplayState, (init) => ({
    ...init,
    speed: persistedSpeed,
  }));

  // Re-load whenever the tick log identity changes (new fight). The reducer's
  // LOAD case preserves the existing speed, so the persisted preference flows
  // through naturally on the first mount.
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

  // Mirror in-fight speed back to the settings store so the user's choice
  // sticks across pages and reloads.
  useEffect(() => {
    if (state.speed === 1 || state.speed === 2 || state.speed === 4) {
      setPersistedSpeed(state.speed);
    }
  }, [state.speed, setPersistedSpeed]);

  return { state, dispatch };
}
