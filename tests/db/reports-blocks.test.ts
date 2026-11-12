import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

describe("blocks and reports", () => {
  it("are server-only: visitors and members can't read or write them", async () => {
    const userId = await db.createAuthUser("db-501@cornell.edu", { onboarded: true });
    const otherId = await db.createAuthUser("db-502@cornell.edu", { onboarded: true });
    for (const tableName of ["blocks", "reports"]) {
      const read = await db.expectError(() =>
        db.asUser(userId, `select * from public.${tableName}`),
      );
      expect(read?.message, tableName).toMatch(/permission denied/);
      const anon = await db.expectError(() => db.asAnon(`select * from public.${tableName}`));
      expect(anon?.message, tableName).toMatch(/permission denied/);
    }
    const block = await db.expectError(() =>
      db.asUser(userId, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [
        userId,
        otherId,
      ]),
    );
    expect(block?.message).toMatch(/permission denied/);
    const report = await db.expectError(() =>
      db.asUser(
        userId,
        `insert into public.reports (reporter_id, reported_id, reason) values ($1, $2, 'spam')`,
        [userId, otherId],
      ),
    );
    expect(report?.message).toMatch(/permission denied/);
  });

  it("keeps one block per pair and direction, and never a block on yourself", async () => {
    const a = await db.createAuthUser("db-503@cornell.edu", { onboarded: true });
    const b = await db.createAuthUser("db-504@cornell.edu", { onboarded: true });
    const insert = (x: string, y: string) =>
      db.asService(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [x, y]);
    await insert(a, b);
    // The other direction is its own row: each person can unblock only their own.
    await insert(b, a);
    expect((await db.expectError(() => insert(a, b)))?.message).toMatch(/duplicate key/);
    expect((await db.expectError(() => insert(a, a)))?.message).toMatch(/blocks_not_self/);
  });

  it("checks a report's reason, note length and that it isn't about yourself", async () => {
    const a = await db.createAuthUser("db-505@cornell.edu", { onboarded: true });
    const b = await db.createAuthUser("db-506@cornell.edu", { onboarded: true });
    const insert = (reporter: string, reported: string, reason: string, note: string | null) =>
      db.asService(
        `insert into public.reports (reporter_id, reported_id, reason, note)
         values ($1, $2, $3::public.report_reason, $4) returning status`,
        [reporter, reported, reason, note],
      );
    expect((await insert(a, b, "harassment", "What happened")).rows[0]?.status).toBe("open");
    expect((await db.expectError(() => insert(a, b, "rude", null)))?.message).toMatch(
      /invalid input value for enum/,
    );
    expect((await db.expectError(() => insert(a, b, "other", "x".repeat(1001))))?.message).toMatch(
      /reports_note_check/,
    );
    expect((await db.expectError(() => insert(a, a, "other", null)))?.message).toMatch(
      /reports_not_self/,
    );
  });

  it("drops blocks with either account, and keeps a report when its reporter leaves", async () => {
    const reporter = await db.createAuthUser("db-507@cornell.edu", { onboarded: true });
    const reported = await db.createAuthUser("db-508@cornell.edu", { onboarded: true });
    const admin = await db.createAuthUser("db-509@cornell.edu", { onboarded: true });
    await db.asService(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [
      reporter,
      reported,
    ]);
    await db.asService(
      `insert into public.reports (reporter_id, reported_id, reason, status, resolved_by)
       values ($1, $2, 'fake', 'resolved', $3)`,
      [reporter, reported, admin],
    );

    await db.asPostgres("delete from auth.users where id = any($1)", [[reporter, admin]]);
    expect((await db.asPostgres("select 1 from public.blocks")).rows).toEqual([]);
    const kept = await db.asPostgres(
      "select reporter_id, resolved_by, status from public.reports where reported_id = $1",
      [reported],
    );
    expect(kept.rows).toEqual([{ reporter_id: null, resolved_by: null, status: "resolved" }]);

    await db.asPostgres("delete from auth.users where id = $1", [reported]);
    expect(
      (await db.asPostgres("select 1 from public.reports where reported_id = $1", [reported])).rows,
    ).toEqual([]);
  });

  it("logs report emails, and members can't set when they accepted the terms", async () => {
    const admin = await db.createAuthUser("db-510@cornell.edu", { onboarded: true });
    await db.asService(
      `insert into public.notification_log (user_id, channel, kind, local_date)
       values ($1, 'email', 'report', current_date)`,
      [admin],
    );
    const unknown = await db.expectError(() =>
      db.asService(
        `insert into public.notification_log (user_id, channel, kind, local_date)
         values ($1, 'email', 'gossip', current_date)`,
        [admin],
      ),
    );
    expect(unknown?.message).toMatch(/notification_log_kind_check/);

    const { rows } = await db.asPostgres(
      "select terms_accepted_at from public.users where id = $1",
      [admin],
    );
    expect(rows[0]?.terms_accepted_at).toBeNull();
    const own = await db.expectError(() =>
      db.asUser(admin, "update public.users set terms_accepted_at = now() where id = $1", [admin]),
    );
    expect(own?.message).toMatch(/permission denied/);
  });
});
