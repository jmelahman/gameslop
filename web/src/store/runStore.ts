import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CombatResponse } from "@/types/game";

export type RunPhase = "shop" | "combat" | "results";

type RunStore = {
  runId: string | null;
  phase: RunPhase | null;
  combat: CombatResponse | null;
  setRun: (runId: string, phase?: RunPhase) => void;
  setPhase: (phase: RunPhase | null) => void;
  setCombat: (combat: CombatResponse | null) => void;
  clearRun: () => void;
};

export const useRunStore = create<RunStore>()(
  persist(
    (set) => ({
      runId: null,
      phase: null,
      combat: null,
      setRun: (runId, phase = "shop") => set({ runId, phase }),
      setPhase: (phase) => set({ phase }),
      setCombat: (combat) => set({ combat }),
      clearRun: () => set({ runId: null, phase: null, combat: null }),
    }),
    {
      name: "gameslop-run",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
