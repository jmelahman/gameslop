// Domain types — camelCase, consumed by React components. Wire shapes
// (snake_case) are mapped via the toDomain* helpers below so the rest of
// the app never has to think about JSON field naming.

import type {
  RunStatus,
  WireActiveRun,
  WireBoardItem,
  WireItem,
  WireRun,
  WireRunState,
  WireShopItem,
} from "./api";

export type Tier = "bronze" | "silver" | "gold" | "diamond";

export type Item = {
  id: string;
  name: string;
  tier: Tier;
  size: number;
  tags: string[];
  buyCost: number;
  sellValue: number;
};

export function toDomainItem(w: WireItem): Item {
  return {
    id: w.id,
    name: w.name,
    tier: w.tier,
    size: w.size,
    tags: w.tags,
    buyCost: w.buy_cost,
    sellValue: w.sell_value,
  };
}

export type { RunStatus };

export type Run = {
  id: number;
  playerId: number;
  heroId: string;
  status: RunStatus;
  shopSeed: number;
  startedAt: number;
  endedAt: number | null;
};

export type BoardItem = {
  itemId: string;
  slot: number;
};

export type ShopItem = {
  itemId: string;
  frozen: boolean;
};

export type RunState = {
  runId: number;
  day: number;
  gold: number;
  hp: number;
  shopLevel: number;
  xp: number;
  shopRolls: number;
  shop: ShopItem[];
  hand: BoardItem[];
  board: BoardItem[];
  updatedAt: number;
};

export type ActiveRun = {
  run: Run;
  state: RunState;
};

export function toDomainRun(w: WireRun): Run {
  return {
    id: w.id,
    playerId: w.player_id,
    heroId: w.hero_id,
    status: w.status,
    shopSeed: w.shop_seed,
    startedAt: w.started_at,
    endedAt: w.ended_at ?? null,
  };
}

export function toDomainBoardItem(w: WireBoardItem): BoardItem {
  return { itemId: w.item_id, slot: w.slot };
}

export function toDomainShopItem(w: WireShopItem): ShopItem {
  return { itemId: w.item_id, frozen: w.frozen };
}

export function toDomainRunState(w: WireRunState): RunState {
  return {
    runId: w.run_id,
    day: w.day,
    gold: w.gold,
    hp: w.hp,
    shopLevel: w.shop_level,
    xp: w.xp,
    shopRolls: w.shop_rolls,
    shop: w.shop.map(toDomainShopItem),
    hand: w.hand.map(toDomainBoardItem),
    board: w.board.map(toDomainBoardItem),
    updatedAt: w.updated_at,
  };
}

export function toDomainActiveRun(w: WireActiveRun): ActiveRun {
  return { run: toDomainRun(w.run), state: toDomainRunState(w.state) };
}
