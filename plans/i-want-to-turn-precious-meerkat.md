# Gameslop — Bazaar-like Roguelike: Implementation Plan

## Context

Gameslop today is a hello-world scaffold: a Go server (`/api/hello`) and a single-component React app. We want to turn it into a **single-player web-based roguelike autobattler** modeled after *The Bazaar* — the player picks a hero, runs through ~10 days of (shop → combat) cycles, builds an item board, and fights generated AI opponents in deterministic tick-based combat. Persistence on the backend (SQLite). All item/icon art generated locally via a Stable Diffusion docker container we control. The branch `kanban/gameslop/start-menu` will land Phase 1 (start menu + routing scaffold); subsequent phases ship as their own PRs.

This plan is the **long-term architecture**, not a single PR. Phase 1 (the start menu) is fully specified; later phases are sequenced and scoped but lighter on detail — they get their own design passes when they come up.

## Locked-in technical decisions

| Area | Choice | Why |
|---|---|---|
| Backend lang | Go (stdlib `net/http`) | Already in use, zero deps, fast iteration with `wgo` |
| DB | `modernc.org/sqlite` (pure Go) | No CGO, single binary, embeds with the SPA |
| Combat sim | Server-authoritative (Go), client replays a tick log | Deterministic, future-proofs PvP |
| Frontend | React 19 + Vite 8 + Tailwind 4 + TS 5.6 + Biome 2 | Already scaffolded |
| Router | React Router v7 (`createBrowserRouter`) | Standard, ~6 routes, no need for TanStack Router complexity |
| Server state | TanStack Query v5 | Stale-while-revalidate, mutations, error states |
| UI state | Zustand (run + settings stores) | Surgical subscriptions, no context re-render storms |
| Combat replay | `useReducer` in `lib/combat/replay.ts` | Pure, testable, ~4 states — XState is overkill |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Only DnD lib with active React 19 support + touch |
| Animations | Framer Motion (no canvas/PixiJS) | Bazaar-style cards don't need a sprite engine |
| Tests | Vitest + RTL + Playwright (already MCP-wired) | Vite-native, no extra build pipeline |
| AI art | Local A1111 WebUI in docker, CPU-only, **SDXL fine-tune (Juggernaut XL / DreamShaper XL)** with full 30–40 step sampling | User constraint: local-only, on-demand, quality over speed |

---

## Backend Architecture

### Package layout

```
/workspace/
  main.go                          # wires deps, registers routes
  cmd/
    genart/main.go                 # CLI: regenerate item art via A1111
  internal/
    db/
      db.go                        # Open(), migrations runner
      migrations/                  # 001_initial.sql, ...
    model/                         # plain data structs, no methods
      item.go hero.go run.go encounter.go combat.go
    catalog/                       # static JSON loaded at startup
      loader.go
      items/{bronze,silver,gold,diamond}.json
      heroes/heroes.json
    store/                         # only layer that touches SQL
      player.go run.go encounter.go history.go
    shop/                          # roll, refresh, buy, sell, freeze
      shop.go rng.go
    encounter/                     # opponent board generation
      generator.go boards.go
    combat/                        # pure simulator, no DB
      simulator.go engine.go effects.go targeting.go
    art/                           # A1111 client + prompt assembly
      client.go prompt.go
    api/                           # HTTP handlers, thin
      router.go middleware.go runs.go shop.go board.go combat.go response.go
  web/                             # unchanged structure (see Frontend section)
```

Hard rule: `internal/combat` imports nothing from `internal/store` or `internal/db`. `Simulate(playerBoard, opponentBoard, seed) → CombatResult` is a pure function. This makes it table-testable and replay-verifiable.

### SQLite schema (highlights — see `001_initial.sql` for full)

- `players` (1 seeded row, FK anchor for future multi-user)
- `item_catalog`, `hero_catalog` — seeded from JSON at startup via `INSERT OR IGNORE`. `effect_json` column stores the full `ItemDef` blob.
- `runs` (player_id, hero_id, status, shop_seed, started_at, ended_at)
- `run_state` (PK = run_id; current day/gold/hp/shop_level/xp + JSON blobs for shop/hand/board)
- `encounters` (run_id, day, opponent_board JSON, seed, status, combat_log JSON) — UNIQUE(run_id, day)
- `run_history` (player_id, run_id, days_reached, outcome)
- `art_assets` (item_id PRIMARY KEY, prompt, seed, model, generated_at, sha256) — tracks generated art lineage; the actual PNG lives in `web/public/items/<id>.png`

JSON blobs (shop, hand, board, opponent_board, combat_log) avoid join-table proliferation for MVP; extract to relational tables only when query needs demand it. Migrations: hand-rolled runner that reads `//go:embed migrations/*.sql`, ordered by filename, tracked in `schema_migrations`. Switch to `pressly/goose` only if it grows past ~10 files.

### Item / effect DSL

Items are **data, not code**. Adding a new item is a JSON edit. Schema:

```json
{
  "id": "sword_of_haste",
  "name": "Sword of Haste",
  "tier": "silver",          // bronze | silver | gold | diamond
  "size": 1,                  // board slots: 1 | 2 | 3
  "tags": ["Weapon"],
  "buy_cost": 4,
  "sell_value": 2,
  "triggers": [
    { "type": "cooldown", "cooldown_ms": 5000,
      "effects": [
        { "op": "damage", "target": "opponent_random", "value": 8 },
        { "op": "haste",  "target": "self_adjacent",   "value": 15, "duration_ms": 3000 }
      ]
    },
    { "type": "on_sell",
      "effects": [{ "op": "gain_gold", "target": "self_player", "value": 2 }]
    }
  ],
  "enchantable": true,
  "enchantment_slots": 1
}
```

Trigger types: `cooldown | on_take_damage | on_sell | at_fight_start | when_adjacent_fires | on_kill`.
Effect ops: `damage | heal | shield | poison | burn | freeze | haste | gain_gold | draw_item | buff`.
Targets: `opponent_random | opponent_all | opponent_front | self_player | self_item | self_adjacent | self_all_weapons`.

### Combat engine

- **Tick rate** 100ms. Max fight 300 ticks (30s).
- Each `BoardItem` carries `remainingMs` and `[]TimedModifier` (haste/slow). Effective per-tick step = `100 * Π(active multipliers)`.
- **Tick order** (fully deterministic):
  1. Decrement cooldowns; collect items with `remainingMs ≤ 0` left-to-right (player board first, then opponent).
  2. For each, queue `cooldown` trigger effects.
  3. Drain effect queue (damage, heal, shield, status apply).
  4. Fire `when_adjacent_fires` triggers.
  5. Check HP; if either ≤ 0 → end. Both ≤ 0 same tick → **tie** (advance day, no reward, no HP cost).
- All RNG comes from a `*rand.Rand` threaded through every randomized call. No globals.
- **Tick log** is the artifact. Event types: `item_fired | damage | heal | shield_applied | shield_broken | status_applied | status_tick | death | fight_end`. Each event carries enough context (source/target, before/after HP) that the client never re-derives state.

### Run progression

- 10 days; player run-HP starts 100, lose 20 on combat loss; reach 0 HP → run ends.
- Daily gold income `min(3 + day, 10)`; +2 on win.
- Shop: 4 levels. Refresh costs 1g; XP buy costs 4g. Tier odds:

| Lvl | Slots | B | S | G | D |
|---|---|---|---|---|---|
| 1 | 3 | 100 | 0 | 0 | 0 |
| 2 | 4 | 60 | 40 | 0 | 0 |
| 3 | 4 | 25 | 50 | 25 | 0 |
| 4 | 5 | 10 | 30 | 40 | 20 |

- Encounter generation: MVP = pre-authored boards per day-tier in `encounter/boards.go`, picked by `seed % len(pool)`. Procedural generation deferred.

### HTTP API surface

REST, JSON. All under `/api/`. Error envelope: `{"error":"...","code":"..."}`.

```
POST   /api/runs                          start a run (body: {hero_id})
GET    /api/runs/active                   current run state
DELETE /api/runs/active                   abandon
POST   /api/runs/active/shop/refresh
POST   /api/runs/active/shop/buy          {shop_index}
POST   /api/runs/active/shop/freeze       {shop_index, frozen}
POST   /api/runs/active/shop/xp
POST   /api/runs/active/board/place       {item_id, slot}
POST   /api/runs/active/board/move        {from_slot, to_slot}
POST   /api/runs/active/board/remove      {slot}
POST   /api/runs/active/items/sell        {item_id}
POST   /api/runs/active/items/enchant     {item_id, enchantment_id}
POST   /api/runs/active/combat/start      → CombatResult (tick log)
GET    /api/runs/active/combat/result
GET    /api/catalog/items                 ?tier=&tag=
GET    /api/catalog/heroes
GET    /api/runs/history                  ?limit=&offset=
```

### Determinism & seeds

One `shop_seed INTEGER` per run (`crypto/rand` at creation). Sub-seeds derived:
```
shop_roll_seed(day)      = shop_seed XOR (day * 0x9e3779b9)
encounter_seed(day)      = shop_seed XOR (day * 0x6b43a9b5)
combat_seed(run_id, day) = shop_seed XOR (run_id * 0x517cc1b727220a95) XOR day
```
Re-running `Simulate()` with the same inputs always yields the same tick log — basis for replay debugging and (later) ghost-data PvP.

---

## Frontend Architecture

### Folder layout (`web/src/`)

```
api/            { client.ts, runs.ts, shop.ts, combat.ts }
types/          { api.ts (snake_case wire), game.ts (camelCase domain), items.ts }
features/       { start-menu, hero-select, shop, combat, results, settings }/
components/     { ui/Button,Modal,Badge,Tooltip ... ; game/ItemCard,HeroAvatar,HealthBar }
hooks/          { useRunGuard, useSettings }
store/          { runStore, settingsStore }
lib/            { combat/replay.ts, combat/sequencer.ts, animations.ts, cn.ts }
router.tsx      route definitions
App.tsx         <RouterProvider/> only
main.tsx        createRoot
```

Convention: `features/` co-locates a feature's components, hooks, and page. `components/` only holds things shared by ≥2 features. `lib/` is React-free (so the replay reducer is trivially unit-testable). `types/api.ts` is the single fetch contract.

### Routes

```
/                     StartMenuPage
/hero-select          HeroSelectPage
/run                  ShopPage         (RunGuard)
/run/combat           CombatPage       (RunGuard)
/run/results          ResultsPage      (RunGuard)
/settings             SettingsPage
```

`<RunGuard>` reads `runStore.runId` (sessionStorage-persisted) and redirects to `/` if absent. Guard checks Zustand state (no API waterfall); the run itself is fetched after navigation via TanStack Query.

### State management

- **Server state**: TanStack Query. `useRun()`, `useShop()`, `useCombatResult()`. Mutations for buy/sell/freeze/refresh; optimistic updates on board placement.
- **UI state**: Zustand. `runStore = { runId, phase }` (sessionStorage); `settingsStore = { playbackSpeed, skipAnimations }` (localStorage).
- **Combat replay**: `useReducer(replayReducer, ...)` in `lib/combat/replay.ts`. State: `{ ticks, currentTick, status, speed }`. Actions: `LOAD | PLAY | PAUSE | ADVANCE | SEEK | SET_SPEED | RESET`. A `useEffect` in `sequencer.ts` owns the `setInterval` that dispatches `ADVANCE` at `100/speed` ms.

### Item & board rendering

CSS Grid: `grid-template-columns: repeat(10, 1fr)`. Items use `gridColumn: span N`. Board is one row; bench is below in the same grid system with more slots.

`ItemCard` anatomy: tier-colored ring (`ring-2 ring-[var(--item-tier)]`), art slot (PNG from `/items/<id>.png` with fallback to a lucide icon), name, size badge, tag icons, cooldown ring (SVG `<circle>` with animated `stroke-dashoffset` driven by Framer Motion), hover tooltip via `AnimatePresence`.

Drag-and-drop: `<DndContext>` wraps the page; board and bench are `<SortableContext>`s with a custom collision strategy that respects multi-slot items. Optimistic local update + rollback on mutation error.

### Combat playback

The board re-renders each tick from `ticks[currentTick]` — no derived state in the reducer. Animations:
- **Damage numbers**: `<AnimatePresence>` keyed `tick:entityId:dmg`; `motion.div` animates `y: 0 → -40, opacity: 1 → 0` over 600ms; multiple events on same entity stagger by `delay: i * 80ms`.
- **Item firing**: `motion.div` overlay pulses `scale: [1, 1.05, 1]` over 300ms.
- **Health bar**: `motion.div style={{ width: \`${pct}%\` }}` — Framer Motion auto-tweens between ticks.
- **Status icons**: `AnimatePresence` per entity.

`<PlaybackControls>` bar dispatches `PLAY/PAUSE/SET_SPEED(1|2|4)/SEEK/RESET`. Skip-to-end seeks to last tick.

### Start menu (Phase 1 deliverable)

Centered flex column on `bg-slate-950`. Background = `motion.div` with a slowly shifting amber/slate radial gradient (no images required). Title `GAMESLOP` slides in (`y: -20 → 0, opacity: 0 → 1`). Menu options (`New Run`, `Continue` (disabled if no `runStore.runId`), `Stats`, `Settings`) stagger in via `variants` + `staggerChildren`. Each button: `whileHover={{ scale: 1.03 }}` + a colored indicator bar that slides in on hover. No API calls — the start menu has zero data dependencies.

### Tests

- `lib/combat/replay.test.ts` — every reducer transition, table-driven.
- `hooks/useRunGuard.test.tsx` — render route tree, assert redirect behavior.
- `components/game/ItemCard.test.tsx` — tier → ring color mapping, tooltip on hover.
- `api/client.test.ts` — fetch mocked, error envelope surfaces correctly.
- Playwright smoke (Phase 13): menu → hero → shop → skip combat → results.

Skip: Tailwind class assertions, Framer Motion animation observation (Playwright covers if it matters).

---

## AI Art Generation (Local Stable Diffusion)

### Why local + on-demand

Per-image API cost = $0; data stays local; generation can run during dev iterations without coordinating cloud credentials. CPU-only is the constraint, but we're prioritizing **quality over speed** — build-time generation runs unattended, so a long wait is fine. Expect **~10–30 min per 1024×1024 icon** on a typical desktop CPU. You queue a batch, walk away, come back to a finished set.

### Container setup

Add `/workspace/docker-compose.yml` with one service. Use `ghcr.io/abdbarho/stable-diffusion-webui-docker` (the `auto-cpu` variant — A1111 configured for CPU). The devcontainer joins the SD container's network; if `kanban-network` already exists and is reachable from the devcontainer, attach the SD container to it. Otherwise create `gameslop-net` and add both.

```yaml
services:
  stable-diffusion:
    image: ghcr.io/abdbarho/stable-diffusion-webui-docker:auto-cpu-latest  # confirm exact tag
    command: --api --listen --use-cpu all --no-half --precision full --skip-torch-cuda-test --xformers-skip
    ports: ["7860:7860"]                # optional, for browser access on host
    volumes:
      - ./art/sd-data/models:/data/models
      - ./art/sd-data/outputs:/output
    networks: [kanban-network]          # falls back to gameslop-net if missing
networks:
  kanban-network:
    external: true                       # if not present, change to: `gameslop-net: {}` and create
```

Devcontainer reaches it at `http://stable-diffusion:7860`. API key not needed (A1111 API is unauthenticated by default; bind only inside the docker network). `art/sd-data/` is gitignored.

**Initial model**: **`JuggernautXL_v9` or `DreamShaperXL_Turbo`** (SDXL, ~7GB) downloaded into `art/sd-data/models/Stable-diffusion/`. SDXL-base + a fantasy/RPG SDXL fine-tune gives noticeably better composition, lighting, and prompt adherence than SD 1.5 — the kind of icon quality you'd expect in a shipping game. No LCM-LoRA; we want full sampling. Optionally add an "Icons" or "Painterly" SDXL LoRA into `art/sd-data/models/Lora/` for tighter style control.

**Sampling settings**: `DPM++ 2M Karras` sampler, **30–40 steps**, CFG 6–7, 1024×1024 base resolution, **Hires Fix on** (1.5× upscale with `4x-UltraSharp` or `R-ESRGAN 4x+ Anime6B`, 15 denoising steps at 0.35 strength). This gives final 1536×1536 art that downscales cleanly for the in-game card render. Slow on CPU — that's the explicit tradeoff.

### Go client (`internal/art/`)

- `client.go` — `type Client struct { BaseURL string; HTTP *http.Client }` with `Generate(ctx, GenerateRequest) (image []byte, seed int64, err error)`. Hits `POST /sdapi/v1/txt2img`; decodes the base64 image from the response.
- `prompt.go` — `BuildPrompt(item ItemDef) string` composes the per-item prompt by combining item name + tags with a fixed style suffix that locks aesthetic consistency. Example: `fantasy game item icon, [item name and tags], highly detailed painted illustration, dramatic rim lighting, centered on dark neutral background, intricate details, ornate, 8k, masterpiece, trending on artstation`. Negative prompt is also fixed: `text, watermark, signature, blurry, deformed, extra limbs, low quality, jpeg artifacts, ugly, flat lighting`.

Style locked by:
- Constant style suffix in every prompt (`prompt.go` constant).
- Fixed seed per item id (e.g. `seed = sha256(item.id)[:8] as int64`) — re-running gen on the same item is deterministic; only deliberate `--reroll` changes art.
- Fixed sampler/steps/cfg/size (`DPM++ 2M Karras`, 35 steps, CFG 6.5, 1024×1024 base, Hires Fix 1.5× → 1536×1536).

### CLI (`cmd/genart/`)

```
go run ./cmd/genart [--all] [--missing-only] [--item <id>] [--reroll]
```

- Default `--missing-only`: scan item catalog, generate art only for ids without a `web/public/items/<id>.png`.
- `--item <id>`: regenerate just one item (fixed seed → same image; pair with `--reroll` to bump the seed).
- `--all`: nuke and regenerate everything (long).
- Writes the PNG to `web/public/items/<id>.png` and upserts an `art_assets` row (prompt, seed, model, sha256) so we can audit what produced what.
- Concurrency: A1111 serializes anyway — keep it 1-at-a-time; print per-item progress + ETA to stdout (e.g. `[12/50] sword_of_haste … done in 18m22s`). Long runs should be kickable in the background (`go run ./cmd/genart --missing-only &`).

### Frontend integration

`ItemCard` renders `<img src={`/items/${item.id}.png`} ...>` with `onError` falling back to a lucide icon (so missing art doesn't break the UI during dev). Vite's `public/` directory serves these directly; the embed build picks them up automatically because they're inside `web/dist/` after `npm run build`.

### Cost model

- SDXL 1024×1024 + Hires Fix at 35 steps on CPU = **~15–30 min per image** (varies with core count and RAM bandwidth).
- ~50 items × ~20 min each = **~15–25 hours total cold start**. Run overnight / over a weekend.
- Subsequent runs only re-gen what's missing (`--missing-only` is the default).
- No user ever waits on this — it's purely build-time. The PNGs are committed to the repo, so a checkout of the repo at any commit gets the art that shipped with that commit.
- If iteration becomes painful, a future enhancement is to add an optional `--fast` flag that swaps to SD 1.5 + LCM for prompt experimentation, then re-run without it for the final commit.

---

## Phased Delivery Roadmap

Each phase = one PR, reviewable in isolation, demo-able when merged. Phases 1–5 get you to **playable end-to-end** (shallow); 6+ deepen.

| # | Phase | Ships | Stubbed | Demo |
|---|---|---|---|---|
| **1** | **Start menu + routing** *(this branch)* | React Router v7, Zustand, Framer Motion installed. `router.tsx`. Full `StartMenuPage`. `RunGuard`. `runStore`. `SettingsPage` stub. | All other pages = placeholders. | Click around the menu, navigate to placeholder pages. |
| 2 | DB + run lifecycle (backend) | `internal/db` + migrations, `players` seeded, `POST /api/runs`, `GET /api/runs/active`. 5 stub items in JSON. | Combat / shop interactions return canned data. | `curl` starts a run, gets state. |
| 3 | API client + TanStack Query | `web/src/api/`, types mirrored from Go, `useRun()`, error boundary. `HeroSelectPage` calls real API. | Hero list still hardcoded client-side. | Menu → pick hero → land on shop placeholder fed by real run state. |
| 4 | Shop UI (static) | `ShopPage` layout, gold display, shop row, board grid, bench, full `ItemCard` with tier styling. Click-to-buy mutation. | No drag, sell/freeze/reroll buttons fire but trivial. | See shop, click items, see them on board. |
| 5 | **End-to-end shallow loop** | `POST /api/runs/active/combat/start` returns minimal tick log. `CombatPage` plays it (no animations). `ResultsPage` with Continue / Abandon. | Combat = 1 tick, 1 event. | Full loop: menu → hero → shop → combat → results → shop. **Playable.** |
| 6 | Drag-and-drop board | `dnd-kit` installed, multi-slot collision, optimistic placement, sell zone. | Visual feedback for invalid drop minimal. | Physically drag items onto the board pre-combat. |
| 7 | Combat engine (real) | `internal/combat/simulator.go` with `cooldown` triggers, `damage`/`heal` effects, `opponent_random` targeting. Pre-authored opponent boards days 1–3. | No haste/slow/poison/burn yet. | Real fights with HP shifts, deterministic by seed. |
| 8 | Combat animations (core) | `useReplay` reducer, playback controls, damage numbers, health bar tweens, item firing pulse, death fade. | Shield/status effects deferred. | Combat feels alive. |
| 9 | Run progression | XP buy, level-up, tier odds, 10-day win condition, run history (DB). | History UI minimal. | Win/lose tracked across runs. |
| 10 | **AI art pipeline** | `docker-compose.yml` for A1111 CPU, model + LCM-LoRA pinned, `internal/art/` client, `cmd/genart` CLI, `art_assets` table, `ItemCard` renders generated PNGs with fallback. | Only first ~10 items have art committed. | `go run ./cmd/genart --missing-only` → PNGs appear → cards look real. |
| 11 | Full effect coverage | Remaining trigger types, all effect ops, haste/slow modifiers, poison/burn over-time ticks, enchantments, full combat animation set (shields, statuses, speed controls, seek bar). | Encounter generation still uses pre-authored boards. | Full combat depth. |
| 12 | Shop interactivity (full) | Reroll / freeze / sell (drag or right-click) / XP buy with gold-tick animations. | XP level effect on shop size cosmetic only. | Shop phase feels complete. |
| 13 | Polish: results, stats, settings | Full results screen (damage, items used, gold earned), `/stats` reading run history, settings page (speed default, skip animations toggle, clear history, keyboard shortcuts). | Sound is stubbed. | Game feels shipped. |
| 14 | Tests + hardening | Vitest + RTL configured. Tests for `replayReducer`, `useRunGuard`, `ItemCard`, `api/client`. Playwright smoke for full loop. Biome rule against `any`. Go table-tests for `Simulate()` against fixed seeds. | — | `npm test` + `go test ./...` green; CI catches regressions. |
| 15+ | Roguelike depth (stretch) | Multiple distinct heroes with passives, item-tag synergy highlights, boss rounds, procedural encounter generation, art for all items, run scoring/leaderboard. | — | Replayable variety. |

### Phase 1 (this branch) — concrete deliverable

**Files created/modified:**
- `web/package.json` — add `react-router`, `zustand`, `framer-motion`, `clsx`, `tailwind-merge`.
- `web/src/router.tsx` — `createBrowserRouter` with all 6 routes, placeholders for non-menu pages.
- `web/src/App.tsx` — replace current body with `<RouterProvider router={router} />`.
- `web/src/store/runStore.ts` — Zustand store, sessionStorage persistence, `{ runId: string|null, phase: 'shop'|'combat'|'results'|null }`.
- `web/src/hooks/useRunGuard.ts` + `web/src/components/RunGuard.tsx` — redirect helper + layout component.
- `web/src/features/start-menu/StartMenuPage.tsx` — full implementation per the spec above.
- `web/src/features/{hero-select,shop,combat,results,settings}/index.tsx` — stub pages.
- `web/src/lib/cn.ts` — `clsx + tailwind-merge` helper.
- `web/src/lib/animations.ts` — Framer Motion variant presets (`fadeUp`, `staggerChildren`, etc.).

**Net change**: ~300 lines + 5 deps. Zero backend changes in this PR.

---

## Critical files to know

**Backend (long-horizon):**
- `/workspace/main.go` — wires DB, catalog, store, router (currently 2 routes; will grow to dependency-injection pattern).
- `/workspace/internal/model/item.go` — every other Go package will import these structs; stabilize early.
- `/workspace/internal/db/db.go` — foundation; nothing else works without it.
- `/workspace/internal/combat/simulator.go` — most complex pure logic; isolated from DB so it's testable.
- `/workspace/internal/api/router.go` — single integration surface for HTTP.
- `/workspace/cmd/genart/main.go` — art pipeline entry point.
- `/workspace/docker-compose.yml` — SD container definition.

**Frontend (long-horizon):**
- `/workspace/web/src/router.tsx` — backbone of every later phase.
- `/workspace/web/src/lib/combat/replay.ts` — most complex isolated client logic.
- `/workspace/web/src/store/runStore.ts` — gates protected routes.
- `/workspace/web/src/components/game/ItemCard.tsx` — most-reused visual component; sets prop/CSS conventions.
- `/workspace/web/src/types/api.ts` — single source of truth for wire shapes.

**Existing utilities to reuse (no rewrites):**
- `web/static.go` / `web/static_embed.go` — Go embed pattern for serving SPA. Generated PNGs in `web/public/items/` are picked up automatically by `npm run build`.
- `web/vite.config.ts` — `/api` proxy already configured; backend additions need no Vite changes.
- `.kanban.toml` — port 7474 (backend) + 5173 (frontend) already mapped; SD container adds 7860 if exposed.
- `.vscode/tasks.json` — `wgo run .` for backend hot-reload, `npm run dev -- --host 0.0.0.0` for frontend.

---

## Verification

### Phase 1 (the PR that lands first)
```bash
cd web && npm install
npm run typecheck                        # passes with zero errors
npm run check                            # Biome clean
npm run dev -- --host 0.0.0.0 &
until curl -sf http://localhost:5173/ >/dev/null; do sleep 1; done
# Drive via Playwright MCP:
#   browser_navigate http://localhost:5173/
#   browser_snapshot                     → shows GAMESLOP title + 4 buttons
#   browser_click "New Run"              → URL becomes /hero-select
#   browser_navigate_back ; browser_click "Settings" → URL becomes /settings
```

### AI art pipeline (Phase 10)
```bash
docker compose up -d stable-diffusion
until curl -sf http://localhost:7860/sdapi/v1/sd-models >/dev/null; do sleep 5; done
go run ./cmd/genart --missing-only
ls web/public/items/                     # PNGs for every catalog item
sqlite3 gameslop.db "SELECT item_id, seed, model FROM art_assets;"
```

### Full game loop (after Phase 5)
```bash
wgo run . &                              # backend hot-reload
cd web && npm run dev -- --host 0.0.0.0 &
until curl -sf -m 1 http://localhost:7474/api/hello >/dev/null \
   && curl -sf -m 1 http://localhost:5173/ >/dev/null; do sleep 2; done
# Playwright MCP: menu → hero → buy item → start combat → see result → continue
```

### Tests (after Phase 14)
```bash
go test ./...                            # all packages green; combat sim deterministic
cd web && npm run typecheck && npm run check && npm test
npx playwright test                      # full-loop smoke
```
