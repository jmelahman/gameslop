// ShopPage — the player's between-combat hub. Layout, top to bottom:
//   1. Hero / day / gold / HP banner
//   2. Board (10-cell grid, multi-slot items)
//   3. Synergy panel (board tag tally + cross-highlight)
//   4. Bench
//   5. Sell zone
//   6. Shop row (refresh, freeze, xp, click-to-buy)
//
// All cross-area transitions are driven by drag-and-drop via @dnd-kit. The
// page owns the <DndContext>, tracks the active drag source, and routes
// drag-end events to the appropriate optimistic mutation. Click-to-buy in
// the shop row, right-click-to-sell on the bench/board, and keyboard
// shortcuts (R/F/Space/?) round out the interaction surface.

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DragOverEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Keyboard } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError } from "@/api/client";
import { startCombat } from "@/api/combat";
import { abandonRun } from "@/api/runs";
import {
  buyShopItem,
  buyShopXP,
  freezeShopItem,
  moveBoardItem,
  placeItem,
  refreshShop,
  removeItem,
  sellItem,
} from "@/api/shop";
import { ItemCard } from "@/components/game/ItemCard";
import { HEROES } from "@/features/hero-select/heroes";
import { useCatalog, useItemIndex } from "@/hooks/useCatalog";
import { RUN_QUERY_KEY, useRun } from "@/hooks/useRun";
import {
  MAX_DAY,
  MAX_SHOP_LEVEL,
  REFRESH_COST,
  XP_COST,
  dailyGoldFor,
  xpThreshold,
} from "@/lib/progression";
import { useRunStore } from "@/store/runStore";
import type { ActiveRun, BoardItem, Item } from "@/types/game";
import { Bench } from "./components/Bench";
import { BoardGrid } from "./components/BoardGrid";
import { DayTransition } from "./components/DayTransition";
import { RunStatusBanner } from "./components/RunStatusBanner";
import { SellZone } from "./components/SellZone";
import { ShopRow } from "./components/ShopRow";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { SynergyPanel } from "./components/SynergyPanel";
import { boardRangeFree, type DragSource, type DropTarget } from "./dnd";
import { countBoardTags, tagsOfItem } from "./synergy";

const INVALID_FLASH_MS = 350;

type HoverState = {
  start: number;
  size: number;
  valid: boolean;
  invalidFlash: boolean;
};

export default function ShopPage() {
  const navigate = useNavigate();
  const clearRun = useRunStore((s) => s.clearRun);
  const setPhase = useRunStore((s) => s.setPhase);
  const setCombat = useRunStore((s) => s.setCombat);
  const qc = useQueryClient();
  const { data, isLoading } = useRun();
  const catalog = useCatalog();
  const itemIndex = useItemIndex();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dragging state owned by the page.
  const [activeSource, setActiveSource] = useState<DragSource | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  // Cross-card hover + keyboard-target tracking.
  const [hoveredShopIndex, setHoveredShopIndex] = useState<number | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const combat = useMutation({
    mutationFn: startCombat,
    onSuccess: (resp) => {
      // TODO(audio): new Audio("/sfx/combat-start.wav").play()
      setCombat(resp);
      setPhase("combat");
      if (resp.run) {
        qc.setQueryData(RUN_QUERY_KEY, resp.run);
      }
      navigate("/run/combat");
    },
    onError: (err) => {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else if (err instanceof Error) setErrorMessage(err.message);
      else setErrorMessage("Failed to start combat");
    },
    throwOnError: false,
  });

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
    fn: ({ handSlot, boardSlot }: { handSlot: number; boardSlot: number }) =>
      placeItem(handSlot, boardSlot),
    onApply: (run, { handSlot, boardSlot }: { handSlot: number; boardSlot: number }) =>
      applyPlace(run, handSlot, boardSlot, itemIndex),
    onError: setErrorMessage,
  });

  const optimisticMove = useOptimisticMutation({
    fn: ({ from, to }: { from: number; to: number }) => moveBoardItem(from, to),
    onApply: (run, { from, to }: { from: number; to: number }) => applyMove(run, from, to),
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const board = data?.state.board ?? [];

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const pw = pointerWithin(args);
    if (pw.length > 0) return pw;
    return rectIntersection(args);
  }, []);

  const onDragStart = useCallback((e: DragStartEvent) => {
    const src = e.active.data.current as DragSource | undefined;
    if (!src) return;
    setActiveSource(src);
    setHover(null);
    setErrorMessage(null);
  }, []);

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const src = e.active.data.current as DragSource | undefined;
      const dst = e.over?.data.current as DropTarget | undefined;
      if (!src || !dst || dst.kind !== "board-cell") {
        setHover(null);
        return;
      }
      const size = src.size;
      const start = dst.slot;
      const ignoreSlot = src.kind === "board" ? src.slot : undefined;
      const valid = boardRangeFree(board, itemIndex, start, size, ignoreSlot);
      setHover({ start, size, valid, invalidFlash: false });
    },
    [board, itemIndex],
  );

  const flashInvalid = useCallback((start: number, size: number) => {
    setHover({ start, size, valid: false, invalidFlash: true });
    setTimeout(() => setHover(null), INVALID_FLASH_MS);
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const src = e.active.data.current as DragSource | undefined;
      const dst = e.over?.data.current as DropTarget | undefined;
      setActiveSource(null);
      if (!src) {
        setHover(null);
        return;
      }
      if (!dst) {
        setHover(null);
        return;
      }

      if (dst.kind === "sell") {
        setHover(null);
        if (src.kind === "hand") optimisticSell.mutate({ location: "hand", slot: src.slot });
        else if (src.kind === "board") optimisticSell.mutate({ location: "board", slot: src.slot });
        return;
      }

      if (dst.kind === "bench") {
        setHover(null);
        if (src.kind === "shop") optimisticBuy.mutate(src.index);
        else if (src.kind === "board") optimisticRemove.mutate(src.slot);
        return;
      }

      if (dst.kind === "board-cell") {
        const start = dst.slot;
        const size = src.size;
        const ignoreSlot = src.kind === "board" ? src.slot : undefined;
        const valid = boardRangeFree(board, itemIndex, start, size, ignoreSlot);
        if (!valid) {
          flashInvalid(start, size);
          return;
        }
        setHover(null);
        if (src.kind === "hand") {
          optimisticPlace.mutate({ handSlot: src.slot, boardSlot: start });
        } else if (src.kind === "board") {
          if (src.slot === start) return;
          optimisticMove.mutate({ from: src.slot, to: start });
        } else if (src.kind === "shop") {
          optimisticBuy.mutate(src.index);
        }
      }
    },
    [
      board,
      itemIndex,
      optimisticBuy,
      optimisticPlace,
      optimisticMove,
      optimisticRemove,
      optimisticSell,
      flashInvalid,
    ],
  );

  const onDragCancel = useCallback(() => {
    setActiveSource(null);
    setHover(null);
  }, []);

  const overlayItem = useMemo<Item | null>(() => {
    if (!activeSource) return null;
    return itemIndex[activeSource.itemId] ?? null;
  }, [activeSource, itemIndex]);

  // Derived synergy data. `tagCounts` is the board's tag tally; the
  // hovered-item tag set is what every section uses to cross-highlight
  // matching cards.
  const tagCounts = useMemo(() => countBoardTags(board, itemIndex), [board, itemIndex]);
  const hoveredTags = useMemo<ReadonlySet<string>>(
    () => (hoveredItemId ? tagsOfItem(hoveredItemId, itemIndex) : new Set()),
    [hoveredItemId, itemIndex],
  );

  const sellBoard = useCallback(
    (slot: number) => {
      setErrorMessage(null);
      optimisticSell.mutate({ location: "board", slot });
    },
    [optimisticSell],
  );
  const sellHand = useCallback(
    (slot: number) => {
      setErrorMessage(null);
      optimisticSell.mutate({ location: "hand", slot });
    },
    [optimisticSell],
  );

  // Keyboard shortcuts. Stable callbacks make the dependency list small;
  // most actions read live state directly off ref-like values (data.state,
  // hoveredShopIndex).
  const state = data?.state;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      const tgt = e.target;
      if (
        tgt instanceof HTMLInputElement ||
        tgt instanceof HTMLTextAreaElement ||
        (tgt instanceof HTMLElement && tgt.isContentEditable)
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }
      if (e.key === "Escape") {
        if (showHelp) {
          e.preventDefault();
          setShowHelp(false);
        }
        return;
      }
      if (showHelp) return;
      if (!state) return;

      const key = e.key.toLowerCase();
      if (key === "r") {
        if (state.gold >= REFRESH_COST && !optimisticRefresh.isPending) {
          e.preventDefault();
          setErrorMessage(null);
          optimisticRefresh.mutate(undefined);
        }
        return;
      }
      if (key === "f") {
        if (hoveredShopIndex === null) return;
        const slot = state.shop[hoveredShopIndex];
        if (!slot?.itemId) return;
        e.preventDefault();
        setErrorMessage(null);
        optimisticFreeze.mutate({ index: hoveredShopIndex, frozen: !slot.frozen });
        return;
      }
      if (key === " " || e.code === "Space") {
        if (combat.isPending) return;
        e.preventDefault();
        setErrorMessage(null);
        combat.mutate();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, hoveredShopIndex, showHelp, optimisticRefresh, optimisticFreeze, combat]);

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

  const { run, state: runState } = data;
  const isDragging = activeSource !== null;
  const draggingShopIndex = activeSource?.kind === "shop" ? activeSource.index : null;
  const draggingHandSlot = activeSource?.kind === "hand" ? activeSource.slot : null;
  const draggingBoardSlot = activeSource?.kind === "board" ? activeSource.slot : null;
  const hero = HEROES.find((h) => h.id === run.heroId);
  const maxHp = hero?.startingHp ?? Math.max(runState.hp, 100);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <main className="flex min-h-screen flex-col gap-6 bg-slate-950 px-6 py-6 text-slate-50">
        <DayTransition day={runState.day} maxDay={MAX_DAY} />
        <RunStatusBanner
          heroName={hero?.name ?? run.heroId}
          runId={run.id}
          day={runState.day}
          maxDay={MAX_DAY}
          hp={runState.hp}
          maxHp={maxHp}
          gold={runState.gold}
          nextDayGold={runState.day < MAX_DAY ? dailyGoldFor(runState.day + 1) : 0}
          shopLevel={runState.shopLevel}
          xp={runState.xp}
          xpToLevel={xpThreshold(runState.shopLevel)}
          maxShopLevel={MAX_SHOP_LEVEL}
          onStartCombat={() => {
            setErrorMessage(null);
            combat.mutate();
          }}
          startingCombat={combat.isPending}
          onAbandon={() => abandon.mutate()}
          abandoning={abandon.isPending}
        />

        <BoardGrid
          board={runState.board}
          itemIndex={itemIndex}
          draggingFromSlot={draggingBoardSlot}
          hover={hover}
          onSell={sellBoard}
          onHoverItem={setHoveredItemId}
          synergyTags={hoveredTags}
        />

        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/30 px-4 py-2">
          <h3 className="text-slate-300 text-xs uppercase tracking-wider">Board synergies</h3>
          <SynergyPanel counts={tagCounts} highlightTags={hoveredTags} />
        </section>

        <Bench
          hand={runState.hand}
          itemIndex={itemIndex}
          draggingFromSlot={draggingHandSlot}
          onSell={sellHand}
          onHoverItem={setHoveredItemId}
          synergyTags={hoveredTags}
        />

        <SellZone active={isDragging} />

        <div className="mt-auto flex w-full justify-end">
          <div className="w-full max-w-3xl">
            <ShopRow
              shop={runState.shop}
              shopLevel={runState.shopLevel}
              xp={runState.xp}
              xpToLevel={xpThreshold(runState.shopLevel)}
              gold={runState.gold}
              itemIndex={itemIndex}
              draggingFromIndex={draggingShopIndex}
              synergyTags={hoveredTags}
              hoveredIndex={hoveredShopIndex}
              refreshing={optimisticRefresh.isPending}
              buyingXP={optimisticXP.isPending}
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
              onSlotHoverChange={(idx) => {
                setHoveredShopIndex(idx);
                if (idx === null) {
                  setHoveredItemId(null);
                  return;
                }
                const id = runState.shop[idx]?.itemId ?? null;
                setHoveredItemId(id);
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

        <HelpButton onOpen={() => setShowHelp(true)} />
        <ShortcutsOverlay open={showHelp} onClose={() => setShowHelp(false)} />
      </main>

      <DragOverlay dropAnimation={null}>
        {overlayItem ? (
          <div className="pointer-events-none w-28">
            <ItemCard item={overlayItem} showTooltip={false} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function HelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Keyboard shortcuts (?)"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-slate-200 text-xs shadow-lg backdrop-blur hover:border-amber-500 hover:text-amber-200"
      aria-label="Keyboard shortcuts"
    >
      <Keyboard className="h-3.5 w-3.5" />
      Shortcuts
      <kbd className="rounded bg-slate-800 px-1 font-mono text-[0.65rem]">?</kbd>
    </button>
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
  if (!slot?.itemId) return null;
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
  boardSlot: number,
  itemIndex: Record<string, Item>,
): ActiveRun | null {
  const handEntry = run.state.hand[handSlot];
  if (!handEntry) return null;
  const def = itemIndex[handEntry.itemId];
  if (!def) return null;
  if (!boardRangeFree(run.state.board, itemIndex, boardSlot, def.size)) return null;
  const moved: BoardItem = { itemId: handEntry.itemId, slot: boardSlot };
  run.state.hand.splice(handSlot, 1);
  run.state.hand = run.state.hand.map((h, i) => ({ ...h, slot: i }));
  run.state.board.push(moved);
  run.state.board.sort((a, b) => a.slot - b.slot);
  return run;
}

function applyMove(run: ActiveRun, fromSlot: number, toSlot: number): ActiveRun | null {
  const idx = run.state.board.findIndex((b) => b.slot === fromSlot);
  if (idx < 0) return null;
  run.state.board[idx] = { ...run.state.board[idx], slot: toSlot };
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
  return run;
}

function applyFreeze(run: ActiveRun, index: number, frozen: boolean): ActiveRun | null {
  const slot = run.state.shop[index];
  if (!slot?.itemId) return null;
  run.state.shop[index] = { ...slot, frozen };
  return run;
}

function applyXP(run: ActiveRun, cost: number): ActiveRun | null {
  if (run.state.gold < cost) return null;
  if (run.state.shopLevel >= MAX_SHOP_LEVEL) return null;
  run.state.gold -= cost;
  run.state.xp += 1;
  // Cascade level-ups while XP meets the threshold for the current level.
  while (run.state.shopLevel < MAX_SHOP_LEVEL) {
    const need = xpThreshold(run.state.shopLevel);
    if (need === null || run.state.xp < need) break;
    run.state.xp -= need;
    run.state.shopLevel += 1;
  }
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
