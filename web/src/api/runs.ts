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

export type RunHistoryPage = {
  entries: RunHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
};

type WireHistoryEntry = {
  id: number;
  run_id: number;
  hero_id: string;
  days_reached: number;
  outcome: RunHistoryEntry["outcome"];
  finished_at: number;
};

type WireHistoryResponse = {
  entries: WireHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
};

function toDomainHistory(w: WireHistoryEntry): RunHistoryEntry {
  return {
    id: w.id,
    runId: w.run_id,
    heroId: w.hero_id,
    daysReached: w.days_reached,
    outcome: w.outcome,
    finishedAt: w.finished_at,
  };
}

export async function getRunHistory(limit = 20, offset = 0): Promise<RunHistoryPage> {
  const wire = await apiFetch<WireHistoryResponse>(
    `/api/runs/history?limit=${limit}&offset=${offset}`,
  );
  return {
    entries: wire.entries.map(toDomainHistory),
    total: wire.total,
    limit: wire.limit,
    offset: wire.offset,
  };
}

export async function clearRunHistory(): Promise<void> {
  await apiFetch<void>("/api/runs/history", { method: "DELETE" });
}
