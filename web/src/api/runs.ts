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
