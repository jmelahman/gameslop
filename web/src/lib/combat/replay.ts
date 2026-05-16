// replayReducer — pure state machine that walks the tick log returned by
// POST /api/runs/active/combat/start. Living here (React-free) keeps it
// trivially unit-testable: feed it actions, assert the next state.
//
// The matching React glue lives in sequencer.ts (useReplay hook).

import type { TickEvent } from "@/types/game";

export type ReplayStatus = "idle" | "playing" | "paused" | "ended";

export type ReplayState = {
  ticks: TickEvent[];
  currentTick: number;
  maxTick: number;
  status: ReplayStatus;
  // 1, 2, 4 — the sequencer dispatches ADVANCE every (100 / speed) ms.
  speed: number;
};

export type ReplayAction =
  | { type: "LOAD"; ticks: TickEvent[] }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "ADVANCE" }
  | { type: "SEEK"; tick: number }
  | { type: "SET_SPEED"; speed: number }
  | { type: "RESET" };

export const initialReplayState: ReplayState = {
  ticks: [],
  currentTick: 0,
  maxTick: 0,
  status: "idle",
  speed: 1,
};

function maxTickOf(ticks: TickEvent[]): number {
  let m = 0;
  for (const e of ticks) {
    if (e.tick > m) m = e.tick;
  }
  return m;
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case "LOAD": {
      const maxTick = maxTickOf(action.ticks);
      return {
        ticks: action.ticks,
        currentTick: 0,
        maxTick,
        // Auto-play on load so the existing "combat plays on mount" UX is
        // preserved without an extra dispatch from the consumer.
        status: maxTick === 0 ? "ended" : "playing",
        speed: state.speed === 0 ? 1 : state.speed,
      };
    }

    case "PLAY": {
      if (state.ticks.length === 0) return state;
      // Replay from the start when the user hits play after the fight has
      // ended; otherwise resume from where we paused.
      if (state.status === "ended") {
        return { ...state, currentTick: 0, status: "playing" };
      }
      return { ...state, status: "playing" };
    }

    case "PAUSE": {
      if (state.status !== "playing") return state;
      return { ...state, status: "paused" };
    }

    case "ADVANCE": {
      if (state.status !== "playing") return state;
      const next = state.currentTick + 1;
      if (next >= state.maxTick) {
        return { ...state, currentTick: state.maxTick, status: "ended" };
      }
      return { ...state, currentTick: next };
    }

    case "SEEK": {
      const clamped = Math.max(0, Math.min(state.maxTick, action.tick));
      const status: ReplayStatus =
        clamped >= state.maxTick
          ? "ended"
          : state.status === "ended"
            ? "paused"
            : state.status === "idle"
              ? "paused"
              : state.status;
      return { ...state, currentTick: clamped, status };
    }

    case "SET_SPEED": {
      const speed = action.speed > 0 ? action.speed : 1;
      return { ...state, speed };
    }

    case "RESET": {
      if (state.ticks.length === 0) {
        return { ...initialReplayState, speed: state.speed };
      }
      return { ...state, currentTick: 0, status: "paused" };
    }
  }
}
