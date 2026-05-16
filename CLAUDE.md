# Gameslop — Claude Notes

A Go backend that serves a simple HTML page. Source of truth for run commands
is `.vscode/tasks.json`; this file translates them for use inside this
devcontainer.

## Running the app

The server is long-running. Start it with `run_in_background: true`, then
poll until its port answers before driving the UI.

**Backend** (`:7474`):

```bash
go run .
```

Wait for it to be reachable before navigating:

```bash
until curl -sf -m 1 http://localhost:7474/ >/dev/null; do sleep 2; done
```

## Tests / lint

- Go: `go test ./...`
- Pre-commit hooks: `prek run --all-files` (run before committing).

## Driving the UI with Playwright MCP

`.mcp.json` registers `@playwright/mcp --headless --isolated`. Use the
`mcp__playwright__browser_*` tools (e.g. `browser_navigate
http://localhost:7474/`, then `browser_snapshot`) — never spawn `npx
playwright` ad-hoc.

`@playwright/mcp` defaults to the `chrome` channel which looks at
`/opt/google/chrome/chrome`; the devcontainer Dockerfile symlinks that to the
bundled Chromium under `$PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`.

## Layout

- `main.go` — Go HTTP server.
