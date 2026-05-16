import { expect, test } from "@playwright/test";

// Force the skip-animations setting before the app boots so the combat page
// jumps straight to results instead of running the replay. Without this the
// smoke test would have to babysit the ~3-30s animation playback.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "gameslop-settings",
      JSON.stringify({
        state: { playbackSpeed: 1, skipAnimations: true },
        version: 0,
      }),
    );
  });
});

test("full loop: menu → hero → shop → combat → results → continue → abandon", async ({
  page,
}) => {
  // Start menu
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "GAMESLOP" })).toBeVisible();
  await page.getByRole("link", { name: /^New Run/ }).click();

  // Hero select
  await expect(page).toHaveURL(/\/hero-select$/);
  await page.getByRole("button", { name: /^Knight/ }).click();
  await page.getByRole("button", { name: /^Begin with Knight/ }).click();

  // Shop — wait for it to render then trigger combat
  await expect(page).toHaveURL(/\/run$/);
  await expect(page.getByRole("button", { name: /Start Combat/i })).toBeVisible();
  await page.getByRole("button", { name: /Start Combat/i }).click();

  // Combat is skipped because skipAnimations is set — we land on results.
  await expect(page).toHaveURL(/\/run\/results$/, { timeout: 15_000 });

  // Continue back to the shop (unless the run ended on day 1, in which case
  // the button reads "Back to menu" and we wind up at /).
  const continueButton = page.getByRole("button", { name: /^(Continue|Back to menu)$/ });
  await continueButton.click();

  // Two valid end-states for this smoke loop: we either advanced to day 2
  // (shop again) or the run terminated. Both prove the loop closes cleanly.
  await page.waitForURL((url) => /\/run$|\/$/.test(url.pathname), { timeout: 15_000 });

  // If we're still in the shop, abandon to confirm the abandon path works.
  if (new URL(page.url()).pathname === "/run") {
    await page.getByRole("button", { name: /^Abandon$/i }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
  }

  // We're back at the menu.
  await expect(page.getByRole("heading", { name: "GAMESLOP" })).toBeVisible();
});
