// Domain types — camelCase, consumed by React components. Wire shapes
// (snake_case) are mapped via the toDomain* helpers below so the rest of
// the app never has to think about JSON field naming.

import type {
  CombatOutcome,
  RunStatus,
  WireActiveRun,
  WireBoardItem,
  WireCombatResponse,
  WireCombatResult,
  WireItem,
  WireRun,
  WireRunState,
  WireShopItem,
  WireTickEvent,
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

export type { CombatOutcome };

export type TickEvent = {
  tick: number;
  type: string;
  source?: string;
  target?: string;
  value?: number;
};

export type CombatResult = {
  seed: number;
  outcome: CombatOutcome;
  playerStartHp: number;
  opponentStartHp: number;
  playerEndHp: number;
  opponentEndHp: number;
  ticks: TickEvent[];
};

export type CombatResponse = {
  result: CombatResult;
  run: ActiveRun | null;
  playerBoard: BoardItem[];
  opponentBoard: BoardItem[];
  opponentHp: number;
  day: number;
  ended: boolean;
  finalOutcome: RunStatus | null;
};

export function toDomainTickEvent(w: WireTickEvent): TickEvent {
  return { tick: w.tick, type: w.type, source: w.source, target: w.target, value: w.value };
}

export function toDomainCombatResult(w: WireCombatResult): CombatResult {
  return {
    seed: w.seed,
    outcome: w.outcome,
    playerStartHp: w.player_start_hp,
    opponentStartHp: w.opponent_start_hp,
    playerEndHp: w.player_end_hp,
    opponentEndHp: w.opponent_end_hp,
    ticks: w.ticks.map(toDomainTickEvent),
  };
}

export function toDomainCombatResponse(w: WireCombatResponse): CombatResponse {
  return {
    result: toDomainCombatResult(w.result),
    run: w.run ? toDomainActiveRun(w.run) : null,
    playerBoard: w.player_board.map(toDomainBoardItem),
    opponentBoard: w.opponent_board.map(toDomainBoardItem),
    opponentHp: w.opponent_hp,
    day: w.day,
    ended: w.ended,
    finalOutcome: w.final_outcome ?? null,
  };
}
