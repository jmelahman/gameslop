# Gameslop — Claude Notes

A Go backend (`/workspace`) plus a React/Vite frontend (`/workspace/web`).
Source of truth for run commands is `.vscode/tasks.json`; this file translates
them for use inside this devcontainer.

## Running the app

Both processes are long-running. Start them with `run_in_background: true`,
then poll until their ports answer before driving the UI.

**Backend** (`:7474`):

```bash
wgo run .
```

`wgo run` is a Go-aware shortcut — it watches `*.go` files and re-runs the
server on change. The default build
serves a placeholder page from `web/static.go`. Build with `-tags embed`
(after `cd web && npm run build`) to serve the real SPA from the embedded
`web/dist`:

```bash
cd web && npm run build && cd .. && go run -tags embed .
```

**Frontend** (`:5173`, talks to backend in the same container — vite proxies
`/api` to `localhost:7474`):

```bash
cd web && npm install && npm run dev -- --host 0.0.0.0
```

Wait for both to be reachable before navigating:

```bash
until curl -sf -m 1 http://localhost:7474/api/hello >/dev/null \
   && curl -sf -m 1 http://localhost:5173/ >/dev/null; do sleep 2; done
```

## Tests / typecheck / lint

- Go: `go test ./...`
- Frontend types: `cd web && npm run typecheck`
- Frontend lint/format (Biome): `cd web && npm run check` (`check:fix` to
  auto-apply safe fixes). The `prek` `biome` hook runs the same check on
  staged `web/**/*.{ts,tsx,js,jsx,json}` files.
- Pre-commit hooks: `prek run --all-files` (run before committing).

## Driving the UI with Playwright MCP

`.mcp.json` registers `@playwright/mcp --headless --isolated`. Use the
`mcp__playwright__browser_*` tools (e.g. `browser_navigate
http://localhost:5173/`, then `browser_snapshot`) — never spawn `npx
playwright` ad-hoc.

`@playwright/mcp` defaults to the `chrome` channel which looks at
`/opt/google/chrome/chrome`; the devcontainer Dockerfile symlinks that to the
bundled Chromium under `$PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.

## Layout

- `main.go` — Go HTTP server. Serves `/api/*` itself, delegates everything
  else to `web.Handler()`.
- `web/` — Vite + React 19 + Tailwind 4 frontend.
- `web/static.go` — default build, placeholder handler.
- `web/static_embed.go` — `-tags embed`, embeds `web/dist` and serves the
  SPA with index.html fallback for client-side routes.

## Plans

Plan-mode artifacts go to `/workspace/plans/<slug>.md` and are **committed to
git** (the directory is no longer gitignored). This is how plans survive across
kanban worktrees — when a new ticket spawns a fresh worktree, `git checkout`
brings the plans with it.

When you finish writing or revising a plan, commit it (typically alongside the
work that implements it, or in a standalone "add plan" commit on the planning
branch). If you start a new ticket that depends on an existing plan, just read
it from `plans/<slug>.md` like any other file.
