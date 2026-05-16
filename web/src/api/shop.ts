// Shop / board mutation client. Every endpoint returns the full ActiveRun
// envelope so the caller can replace cached run state in one operation.

import type { WireActiveRun } from "@/types/api";
import { type ActiveRun, toDomainActiveRun } from "@/types/game";
import { apiFetch } from "./client";

async function postRun(path: string, body?: unknown): Promise<ActiveRun> {
  const wire = await apiFetch<WireActiveRun>(path, { method: "POST", body });
  return toDomainActiveRun(wire);
}

export const buyShopItem = (shopIndex: number) =>
  postRun("/api/runs/active/shop/buy", { shop_index: shopIndex });

export const refreshShop = () => postRun("/api/runs/active/shop/refresh");

export const freezeShopItem = (shopIndex: number, frozen: boolean) =>
  postRun("/api/runs/active/shop/freeze", { shop_index: shopIndex, frozen });

export const buyShopXP = () => postRun("/api/runs/active/shop/xp");

export const placeItem = (handSlot: number, boardSlot?: number) =>
  postRun("/api/runs/active/board/place", {
    hand_slot: handSlot,
    ...(boardSlot !== undefined ? { board_slot: boardSlot } : {}),
  });

export const removeItem = (boardSlot: number) =>
  postRun("/api/runs/active/board/remove", { board_slot: boardSlot });

export const sellItem = (location: "board" | "hand", slot: number) =>
  postRun("/api/runs/active/items/sell", { location, slot });
