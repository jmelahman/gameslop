import type { WireItem } from "@/types/api";
import { type Item, toDomainItem } from "@/types/game";
import { apiFetch } from "./client";

export async function getItems(signal?: AbortSignal): Promise<Item[]> {
  const wire = await apiFetch<WireItem[]>("/api/catalog/items", { signal });
  return wire.map(toDomainItem);
}
