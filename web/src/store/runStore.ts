import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RunPhase = "shop" | "combat" | "results";

type RunStore = {
  runId: string | null;
  phase: RunPhase | null;
  setRun: (runId: string, phase?: RunPhase) => void;
  setPhase: (phase: RunPhase | null) => void;
  clearRun: () => void;
};

export const useRunStore = create<RunStore>()(
  persist(
    (set) => ({
      runId: null,
      phase: null,
      setRun: (runId, phase = "shop") => set({ runId, phase }),
      setPhase: (phase) => set({ phase }),
      clearRun: () => set({ runId: null, phase: null }),
    }),
    {
      name: "gameslop-run",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
