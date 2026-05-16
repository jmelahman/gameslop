import { useRunStore } from "@/store/runStore";

export function useRunGuard(): string | null {
  return useRunStore((s) => s.runId);
}
