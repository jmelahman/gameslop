import type { WireActiveRun } from "@/types/api";
import { type ActiveRun, toDomainActiveRun } from "@/types/game";
import { ApiError, apiFetch } from "./client";

export async function getActiveRun(signal?: AbortSignal): Promise<ActiveRun | null> {
  try {
    const wire = await apiFetch<WireActiveRun>("/api/runs/active", { signal });
    return toDomainActiveRun(wire);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function startRun(heroId: string): Promise<ActiveRun> {
  const wire = await apiFetch<WireActiveRun>("/api/runs", {
    method: "POST",
    body: { hero_id: heroId },
  });
  return toDomainActiveRun(wire);
}

export async function abandonRun(): Promise<void> {
  await apiFetch<void>("/api/runs/active", { method: "DELETE" });
}

export type RunHistoryEntry = {
  id: number;
  runId: number;
  heroId: string;
  daysReached: number;
  outcome: "active" | "won" | "lost" | "abandoned";
  finishedAt: number;
};

type WireHistoryEntry = {
  id: number;
  run_id: number;
  hero_id: string;
  days_reached: number;
  outcome: RunHistoryEntry["outcome"];
  finished_at: number;
};

export async function getRunHistory(limit = 20): Promise<RunHistoryEntry[]> {
  const wire = await apiFetch<WireHistoryEntry[]>(`/api/runs/history?limit=${limit}`);
  return wire.map((w) => ({
    id: w.id,
    runId: w.run_id,
    heroId: w.hero_id,
    daysReached: w.days_reached,
    outcome: w.outcome,
    finishedAt: w.finished_at,
  }));
}
