import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;

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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
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
    },
  },
});
