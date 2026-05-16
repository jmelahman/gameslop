// Wire types mirroring Go structs in internal/model. Field names match
// JSON tags (snake_case). Anything the backend serializes for /api/* lives
// here.

export type RunStatus = "active" | "won" | "lost" | "abandoned";

export type WireRun = {
  id: number;
  player_id: number;
  hero_id: string;
  status: RunStatus;
  shop_seed: number;
  started_at: number;
  ended_at?: number;
};

export type WireBoardItem = {
  item_id: string;
  slot: number;
};

export type WireShopItem = {
  item_id: string;
  frozen: boolean;
};

export type WireRunState = {
  run_id: number;
  day: number;
  gold: number;
  hp: number;
  shop_level: number;
  xp: number;
  shop: WireShopItem[];
  hand: WireBoardItem[];
  board: WireBoardItem[];
  updated_at: number;
};

export type WireActiveRun = {
  run: WireRun;
  state: WireRunState;
};

export type WireError = {
  error: string;
  code?: string;
};
