import { useQuery } from "@tanstack/react-query";
import { getActiveRun } from "@/api/runs";
import { useRunStore } from "@/store/runStore";

export const RUN_QUERY_KEY = ["run", "active"] as const;

export function useRun() {
  const runId = useRunStore((s) => s.runId);
  return useQuery({
    queryKey: RUN_QUERY_KEY,
    queryFn: ({ signal }) => getActiveRun(signal),
    enabled: runId !== null,
  });
}
