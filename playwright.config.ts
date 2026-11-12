import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

/** Specs that don't run in the two browser projects. */
const BROWSERLESS = [/pilot\.spec\.ts/, /api\.spec\.ts/];

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: BROWSERLESS },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: BROWSERLESS },
    // The iOS app's JSON API (docs/plans/ios-app.md): plain requests, so once is enough.
    { name: "api", testMatch: /api\.spec\.ts/ },
    // The pilot gate is one switch for the whole app, so its tests run alone,
    // after every other test, and turn it off again.
    {
      name: "pilot",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /pilot\.spec\.ts/,
      dependencies: ["chromium", "mobile", "api"],
    },
  ],
  webServer: {
    command: process.env.CI ? `pnpm start --port ${PORT}` : `pnpm dev --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // `pnpm start` runs in production mode, where src/lib/config.ts requires
    // these secrets. Test-only values; never used outside e2e runs.
    env: {
      RESPONSE_TOKEN_SECRET:
        process.env.RESPONSE_TOKEN_SECRET || "e2e-response-token-secret-not-for-production",
      CRON_SECRET: process.env.CRON_SECRET || "e2e-cron-secret",
      // Every e2e request comes from one IP; the per-IP sign-in limit would stop the suite.
      LOGIN_RATE_LIMIT_PER_IP: "100000",
    },
  },
});
