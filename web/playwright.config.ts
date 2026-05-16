import { defineConfig, devices } from "@playwright/test";

// Playwright drives both servers via the webServer block. The Go backend
// serves /api/*; Vite serves the SPA and proxies /api to the backend. CI and
// local both go through the Vite port so the proxy chain is exercised the
// same way the user hits it.
//
// The backend uses a temp SQLite path via GAMESLOP_DB so test runs never
// stomp on a developer's dev database.
const BACKEND_PORT = process.env.GAMESLOP_TEST_BACKEND_PORT ?? "7575";
const FRONTEND_PORT = process.env.GAMESLOP_TEST_FRONTEND_PORT ?? "5273";
const TEST_DB = process.env.GAMESLOP_TEST_DB ?? "/tmp/gameslop-e2e.db";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `rm -f ${TEST_DB} && go run ../.`,
      cwd: ".",
      url: `http://localhost:${BACKEND_PORT}/api/hello`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        GAMESLOP_ADDR: `:${BACKEND_PORT}`,
        GAMESLOP_DB: TEST_DB,
      },
    },
    {
      command: `npm run dev -- --host 0.0.0.0 --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        GAMESLOP_BACKEND: `localhost:${BACKEND_PORT}`,
      },
    },
  ],
});
