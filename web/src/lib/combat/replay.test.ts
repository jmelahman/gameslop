import { describe, expect, it } from "vitest";
import type { TickEvent } from "@/types/game";
import { initialReplayState, type ReplayState, replayReducer } from "./replay";

const evt = (tick: number, type = "damage"): TickEvent => ({ tick, type });

const sampleTicks: TickEvent[] = [
  evt(0, "fight_start"),
  evt(1, "item_fired"),
  evt(1, "damage"),
  evt(3, "damage"),
  evt(5, "fight_end"),
];

const loaded = (overrides: Partial<ReplayState> = {}): ReplayState => ({
  ...initialReplayState,
  ticks: sampleTicks,
  maxTick: 5,
  status: "playing",
  ...overrides,
});

describe("replayReducer", () => {
  describe("LOAD", () => {
    it("populates ticks, derives maxTick, and starts playing", () => {
      const next = replayReducer(initialReplayState, { type: "LOAD", ticks: sampleTicks });
      expect(next.ticks).toBe(sampleTicks);
      expect(next.maxTick).toBe(5);
      expect(next.currentTick).toBe(0);
      expect(next.status).toBe("playing");
      expect(next.speed).toBe(1);
    });

    it("preserves a previously chosen speed across loads", () => {
      const prev: ReplayState = { ...initialReplayState, speed: 4 };
      const next = replayReducer(prev, { type: "LOAD", ticks: sampleTicks });
      expect(next.speed).toBe(4);
    });

    it("ends immediately when given an empty tick log", () => {
      const next = replayReducer(initialReplayState, { type: "LOAD", ticks: [] });
      expect(next.maxTick).toBe(0);
      expect(next.status).toBe("ended");
    });
  });

  describe("PLAY", () => {
    it("is a no-op when no fight is loaded", () => {
      const next = replayReducer(initialReplayState, { type: "PLAY" });
      expect(next).toBe(initialReplayState);
    });

    it("resumes from paused", () => {
      const next = replayReducer(loaded({ status: "paused", currentTick: 2 }), { type: "PLAY" });
      expect(next.status).toBe("playing");
      expect(next.currentTick).toBe(2);
    });

    it("restarts from tick 0 when previously ended", () => {
      const next = replayReducer(loaded({ status: "ended", currentTick: 5 }), { type: "PLAY" });
      expect(next.status).toBe("playing");
      expect(next.currentTick).toBe(0);
    });
  });

  describe("PAUSE", () => {
    it("pauses while playing", () => {
      const next = replayReducer(loaded({ status: "playing", currentTick: 2 }), { type: "PAUSE" });
      expect(next.status).toBe("paused");
      expect(next.currentTick).toBe(2);
    });

    it("is a no-op when not playing", () => {
      const state = loaded({ status: "ended", currentTick: 5 });
      const next = replayReducer(state, { type: "PAUSE" });
      expect(next).toBe(state);
    });
  });

  describe("ADVANCE", () => {
    it("increments currentTick while playing", () => {
      const next = replayReducer(loaded({ currentTick: 1 }), { type: "ADVANCE" });
      expect(next.currentTick).toBe(2);
      expect(next.status).toBe("playing");
    });

    it("clamps to maxTick and transitions to ended on the final tick", () => {
      const next = replayReducer(loaded({ currentTick: 4 }), { type: "ADVANCE" });
      expect(next.currentTick).toBe(5);
      expect(next.status).toBe("ended");
    });

    it("does not advance when paused", () => {
      const state = loaded({ status: "paused", currentTick: 2 });
      const next = replayReducer(state, { type: "ADVANCE" });
      expect(next).toBe(state);
    });

    it("does not advance once ended", () => {
      const state = loaded({ status: "ended", currentTick: 5 });
      const next = replayReducer(state, { type: "ADVANCE" });
      expect(next).toBe(state);
    });
  });

  describe("SEEK", () => {
    it("jumps to the requested tick", () => {
      const next = replayReducer(loaded({ currentTick: 0 }), { type: "SEEK", tick: 3 });
      expect(next.currentTick).toBe(3);
    });

    it("clamps below 0 to 0", () => {
      const next = replayReducer(loaded({ currentTick: 2 }), { type: "SEEK", tick: -10 });
      expect(next.currentTick).toBe(0);
    });

    it("clamps above maxTick and marks ended", () => {
      const next = replayReducer(loaded({ currentTick: 0 }), { type: "SEEK", tick: 99 });
      expect(next.currentTick).toBe(5);
      expect(next.status).toBe("ended");
    });

    it("preserves playing status when seeking mid-fight", () => {
      const next = replayReducer(loaded({ status: "playing", currentTick: 0 }), {
        type: "SEEK",
        tick: 2,
      });
      expect(next.status).toBe("playing");
    });

    it("moves ended → paused when seeking back from the end", () => {
      const next = replayReducer(loaded({ status: "ended", currentTick: 5 }), {
        type: "SEEK",
        tick: 2,
      });
      expect(next.status).toBe("paused");
    });
  });

  describe("SET_SPEED", () => {
    it("sets the speed", () => {
      const next = replayReducer(loaded(), { type: "SET_SPEED", speed: 4 });
      expect(next.speed).toBe(4);
    });

    it("falls back to 1 for non-positive speeds", () => {
      const next = replayReducer(loaded(), { type: "SET_SPEED", speed: 0 });
      expect(next.speed).toBe(1);
    });
  });

  describe("RESET", () => {
    it("rewinds to tick 0 and pauses", () => {
      const next = replayReducer(loaded({ status: "ended", currentTick: 5 }), { type: "RESET" });
      expect(next.currentTick).toBe(0);
      expect(next.status).toBe("paused");
    });

    it("clears to initial state when no fight is loaded", () => {
      const prev: ReplayState = { ...initialReplayState, speed: 2 };
      const next = replayReducer(prev, { type: "RESET" });
      expect(next.ticks).toEqual([]);
      expect(next.maxTick).toBe(0);
      expect(next.status).toBe("idle");
      // Speed survives a hard reset so user playback prefs aren't clobbered.
      expect(next.speed).toBe(2);
    });
  });
});
