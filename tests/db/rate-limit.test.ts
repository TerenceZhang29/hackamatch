import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

describe("hit_rate_limit", () => {
  it("allows up to the max in a window, then refuses", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const { rows } = await db.asPostgres<{ ok: boolean }>(
        "select public.hit_rate_limit('test:key', 3600, 3) as ok",
      );
      results.push(rows[0]!.ok);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it("counts keys separately and clears old windows", async () => {
    await db.asPostgres(
      "insert into public.rate_limits (key, window_start, count) values ('test:old', now() - interval '2 hours', 99)",
    );
    const { rows } = await db.asPostgres<{ ok: boolean }>(
      "select public.hit_rate_limit('test:old', 3600, 1) as ok",
    );
    expect(rows[0]!.ok).toBe(true);
    const left = await db.asPostgres<{ n: number }>(
      "select count(*)::int as n from public.rate_limits where key = 'test:old'",
    );
    expect(left.rows[0]!.n).toBe(1);
  });

  it("is not callable or readable by signed-in users", async () => {
    const user = await db.createAuthUser("db-601@cornell.edu");
    const call = await db.expectError(() =>
      db.asUser(user, "select public.hit_rate_limit('x', 60, 1)"),
    );
    expect(call?.message).toMatch(/permission denied/);
    const read = await db.expectError(() => db.asUser(user, "select * from public.rate_limits"));
    expect(read?.message).toMatch(/permission denied/);
  });
});
