// ShopPage — the player's between-combat hub. Layout, top to bottom:
//   1. Hero / day / gold / HP banner
//   2. Board (10-cell grid, multi-slot items)
//   3. Bench
//   4. Shop row (refresh, freeze, xp, buy)
//
// Mutations run optimistically against the cached ActiveRun; if the server
// rejects (e.g. board_full, insufficient_gold), the cache rolls back and an
// error toast appears at the bottom of the screen.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Coins, Heart, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "@/api/client";
import { abandonRun } from "@/api/runs";
import {
  buyShopItem,
  buyShopXP,
  freezeShopItem,
  placeItem,
  refreshShop,
  removeItem,
  sellItem,
} from "@/api/shop";
import { RUN_QUERY_KEY, useRun } from "@/hooks/useRun";
import { useCatalog, useItemIndex } from "@/hooks/useCatalog";
import { useRunStore } from "@/store/runStore";
import type { ActiveRun, BoardItem, Item } from "@/types/game";
import { Bench } from "./components/Bench";
import { BoardGrid } from "./components/BoardGrid";
import { ShopRow } from "./components/ShopRow";

const REFRESH_COST = 1;
const XP_COST = 4;
const MAX_SHOP_LEVEL = 4;
const BOARD_WIDTH = 10;

export default function ShopPage() {
  const navigate = useNavigate();
  const clearRun = useRunStore((s) => s.clearRun);
  const qc = useQueryClient();
  const { data, isLoading } = useRun();
  const catalog = useCatalog();
  const itemIndex = useItemIndex();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && data === null) {
      clearRun();
      navigate("/", { replace: true });
    }
  }, [data, isLoading, clearRun, navigate]);

  const optimisticBuy = useOptimisticMutation({
    fn: buyShopItem,
    onApply: (run, shopIndex: number) => applyBuy(run, shopIndex, itemIndex),
    onError: setErrorMessage,
  });

  const optimisticPlace = useOptimisticMutation({
    fn: (handSlot: number) => placeItem(handSlot),
    onApply: (run, handSlot: number) => applyPlace(run, handSlot, itemIndex),
    onError: setErrorMessage,
  });

  const optimisticRemove = useOptimisticMutation({
    fn: removeItem,
    onApply: (run, boardSlot: number) => applyRemove(run, boardSlot),
    onError: setErrorMessage,
  });

  const optimisticRefresh = useOptimisticMutation({
    fn: () => refreshShop(),
    onApply: (run) => applyRefreshCost(run, REFRESH_COST),
    onError: setErrorMessage,
  });

  const optimisticFreeze = useOptimisticMutation({
    fn: ({ index, frozen }: { index: number; frozen: boolean }) => freezeShopItem(index, frozen),
    onApply: (run, { index, frozen }: { index: number; frozen: boolean }) =>
      applyFreeze(run, index, frozen),
    onError: setErrorMessage,
  });

  const optimisticXP = useOptimisticMutation({
    fn: () => buyShopXP(),
    onApply: (run) => applyXP(run, XP_COST),
    onError: setErrorMessage,
  });

  const optimisticSell = useOptimisticMutation({
    fn: ({ location, slot }: { location: "board" | "hand"; slot: number }) =>
      sellItem(location, slot),
    onApply: (run, { location, slot }: { location: "board" | "hand"; slot: number }) =>
      applySell(run, location, slot, itemIndex),
    onError: setErrorMessage,
  });

  const abandon = useMutation({
    mutationFn: abandonRun,
    onSuccess: () => {
      clearRun();
      qc.removeQueries({ queryKey: RUN_QUERY_KEY });
      navigate("/", { replace: true });
    },
    throwOnError: false,
  });

  if (isLoading || data === null || data === undefined || catalog.isLoading) {
    return <ShopSkeleton />;
  }
  if (catalog.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-rose-300">
        <p>Failed to load item catalog.</p>
      </main>
    );
  }

  const { run, state } = data;

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-slate-950 px-6 py-6 text-slate-50">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-5 py-3">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-amber-400" />
          <div>
            <p className="font-semibold capitalize text-lg leading-tight">{run.heroId}</p>
            <p className="text-slate-400 text-xs uppercase tracking-wider">
              Day {state.day} · Run #{run.id}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Stat icon={<Heart className="h-4 w-4 text-rose-400" />} label="hp" value={state.hp} />
          <Stat
            icon={<Coins className="h-4 w-4 text-amber-300" />}
            label="gold"
            value={state.gold}
          />
          <button
            type="button"
            onClick={() => abandon.mutate()}
            disabled={abandon.isPending}
            className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-1.5 text-rose-200 text-xs hover:bg-rose-900/40 disabled:opacity-50"
          >
            {abandon.isPending ? "Abandoning…" : "Abandon"}
          </button>
        </div>
      </header>

      <BoardGrid
        board={state.board}
        itemIndex={itemIndex}
        onRemove={(slot) => {
          setErrorMessage(null);
          optimisticRemove.mutate(slot);
        }}
      />

      <Bench
        hand={state.hand}
        itemIndex={itemIndex}
        onPlace={(handSlot) => {
          setErrorMessage(null);
          optimisticPlace.mutate(handSlot);
        }}
        onSell={(handSlot) => {
          setErrorMessage(null);
          optimisticSell.mutate({ location: "hand", slot: handSlot });
        }}
      />

      <div className="mt-auto flex w-full justify-end">
        <div className="w-full max-w-3xl">
          <ShopRow
            shop={state.shop}
            shopLevel={state.shopLevel}
            gold={state.gold}
            itemIndex={itemIndex}
            onBuy={(index) => {
              setErrorMessage(null);
              optimisticBuy.mutate(index);
            }}
            onFreeze={(index, frozen) => {
              setErrorMessage(null);
              optimisticFreeze.mutate({ index, frozen });
            }}
            onRefresh={() => {
              setErrorMessage(null);
              optimisticRefresh.mutate(undefined);
            }}
            onXP={() => {
              setErrorMessage(null);
              optimisticXP.mutate(undefined);
            }}
            refreshCost={REFRESH_COST}
            xpCost={XP_COST}
            maxShopLevel={MAX_SHOP_LEVEL}
          />
        </div>
      </div>

      {errorMessage ? (
        <motion.div
          key={errorMessage}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md border border-rose-700 bg-rose-950/90 px-4 py-2 text-rose-100 text-sm shadow-lg"
          role="alert"
        >
          {errorMessage}
        </motion.div>
      ) : null}
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      {icon}
      <span className="font-mono text-base">{value}</span>
      <span className="text-slate-500 text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ShopSkeleton() {
  return (
    <main className="flex min-h-screen flex-col gap-6 bg-slate-950 px-6 py-6 text-slate-50">
      <div className="h-16 animate-pulse rounded-lg bg-slate-900/60" />
      <div className="h-32 animate-pulse rounded-lg bg-slate-900/60" />
      <div className="h-32 animate-pulse rounded-lg bg-slate-900/60" />
      <div className="mt-auto h-44 animate-pulse rounded-lg bg-slate-900/60" />
    </main>
  );
}

// useOptimisticMutation wires a server mutation to a local rollback. The
// applier mutates a deep-clone of the run; on error we restore the snapshot
// and surface the message.
function useOptimisticMutation<TArgs>({
  fn,
  onApply,
  onError,
}: {
  fn: (args: TArgs) => Promise<ActiveRun>;
  onApply: (run: ActiveRun, args: TArgs) => ActiveRun | null;
  onError: (msg: string | null) => void;
}) {
  const qc = useQueryClient();
  return useMutation<ActiveRun, unknown, TArgs, { prev: ActiveRun | null }>({
    mutationFn: fn,
    onMutate: async (args) => {
      await qc.cancelQueries({ queryKey: RUN_QUERY_KEY });
      const prev = qc.getQueryData<ActiveRun>(RUN_QUERY_KEY) ?? null;
      if (prev) {
        const next = onApply(cloneRun(prev), args);
        if (next) qc.setQueryData(RUN_QUERY_KEY, next);
      }
      return { prev };
    },
    onError: (err, _args, ctx) => {
      if (ctx?.prev) qc.setQueryData(RUN_QUERY_KEY, ctx.prev);
      if (err instanceof ApiError) onError(err.message);
      else if (err instanceof Error) onError(err.message);
      else onError("Request failed");
    },
    onSuccess: (next) => {
      qc.setQueryData(RUN_QUERY_KEY, next);
      onError(null);
    },
    throwOnError: false,
  });
}

function cloneRun(r: ActiveRun): ActiveRun {
  return {
    run: { ...r.run },
    state: {
      ...r.state,
      shop: r.state.shop.map((s) => ({ ...s })),
      hand: r.state.hand.map((h) => ({ ...h })),
      board: r.state.board.map((b) => ({ ...b })),
    },
  };
}

function applyBuy(
  run: ActiveRun,
  shopIndex: number,
  itemIndex: Record<string, Item>,
): ActiveRun | null {
  const slot = run.state.shop[shopIndex];
  if (!slot || !slot.itemId) return null;
  const def = itemIndex[slot.itemId];
  if (!def) return null;
  if (run.state.gold < def.buyCost) return null;
  run.state.gold -= def.buyCost;
  run.state.shop[shopIndex] = { itemId: "", frozen: false };
  run.state.hand.push({ itemId: def.id, slot: run.state.hand.length });
  return run;
}

function applyPlace(
  run: ActiveRun,
  handSlot: number,
  itemIndex: Record<string, Item>,
): ActiveRun | null {
  const handEntry = run.state.hand[handSlot];
  if (!handEntry) return null;
  const def = itemIndex[handEntry.itemId];
  if (!def) return null;
  const free = findFreeContiguousSlot(run.state.board, itemIndex, def.size);
  if (free === null) return null;
  const moved: BoardItem = { itemId: handEntry.itemId, slot: free };
  run.state.hand.splice(handSlot, 1);
  run.state.hand = run.state.hand.map((h, i) => ({ ...h, slot: i }));
  run.state.board.push(moved);
  run.state.board.sort((a, b) => a.slot - b.slot);
  return run;
}

function applyRemove(run: ActiveRun, boardSlot: number): ActiveRun | null {
  const idx = run.state.board.findIndex((b) => b.slot === boardSlot);
  if (idx < 0) return null;
  const [removed] = run.state.board.splice(idx, 1);
  run.state.hand.push({ itemId: removed.itemId, slot: run.state.hand.length });
  return run;
}

function applyRefreshCost(run: ActiveRun, cost: number): ActiveRun | null {
  if (run.state.gold < cost) return null;
  run.state.gold -= cost;
  // The actual reroll is server-authoritative; we just mark the cost
  // optimistically so the gold counter reacts immediately.
  return run;
}

function applyFreeze(run: ActiveRun, index: number, frozen: boolean): ActiveRun | null {
  const slot = run.state.shop[index];
  if (!slot || !slot.itemId) return null;
  run.state.shop[index] = { ...slot, frozen };
  return run;
}

function applyXP(run: ActiveRun, cost: number): ActiveRun | null {
  if (run.state.gold < cost) return null;
  if (run.state.shopLevel >= MAX_SHOP_LEVEL) return null;
  run.state.gold -= cost;
  run.state.shopLevel += 1;
  return run;
}

function applySell(
  run: ActiveRun,
  location: "board" | "hand",
  slot: number,
  itemIndex: Record<string, Item>,
): ActiveRun | null {
  if (location === "hand") {
    const entry = run.state.hand[slot];
    if (!entry) return null;
    const def = itemIndex[entry.itemId];
    if (!def) return null;
    run.state.hand.splice(slot, 1);
    run.state.hand = run.state.hand.map((h, i) => ({ ...h, slot: i }));
    run.state.gold += def.sellValue;
    return run;
  }
  const idx = run.state.board.findIndex((b) => b.slot === slot);
  if (idx < 0) return null;
  const def = itemIndex[run.state.board[idx].itemId];
  if (!def) return null;
  run.state.board.splice(idx, 1);
  run.state.gold += def.sellValue;
  return run;
}

function findFreeContiguousSlot(
  board: BoardItem[],
  itemIndex: Record<string, Item>,
  size: number,
): number | null {
  const occupied = new Array<boolean>(BOARD_WIDTH).fill(false);
  for (const b of board) {
    const w = itemIndex[b.itemId]?.size ?? 1;
    for (let i = b.slot; i < b.slot + w && i < BOARD_WIDTH; i++) occupied[i] = true;
  }
  for (let s = 0; s + size <= BOARD_WIDTH; s++) {
    let free = true;
    for (let i = s; i < s + size; i++) {
      if (occupied[i]) {
        free = false;
        break;
      }
    }
    if (free) return s;
  }
  return null;
}
