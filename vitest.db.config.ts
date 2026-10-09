import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Database tests run against the local Supabase stack (`pnpm db:start`), so
// they are separate from the fast unit suite. Files share one database, so run
// them one at a time; each test rolls back its own transaction.
export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
