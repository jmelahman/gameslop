// Combat API client. Phase 5 ships two endpoints:
//   - POST /api/runs/active/combat/start: triggers the day's fight, persists
//     the encounter, and advances or ends the run. The response carries the
//     deterministic tick log + the new run state (or null if the run ended).
//   - GET /api/runs/active/combat/result: returns the latest resolved
//     encounter for recovery after a refresh during combat playback.

import type { WireCombatResponse } from "@/types/api";
import { type CombatResponse, toDomainCombatResponse } from "@/types/game";
import { ApiError, apiFetch } from "./client";

export async function startCombat(): Promise<CombatResponse> {
  const wire = await apiFetch<WireCombatResponse>("/api/runs/active/combat/start", {
    method: "POST",
  });
  return toDomainCombatResponse(wire);
}

export async function getCombatResult(signal?: AbortSignal): Promise<CombatResponse | null> {
  try {
    const wire = await apiFetch<WireCombatResponse>("/api/runs/active/combat/result", { signal });
    return toDomainCombatResponse(wire);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
