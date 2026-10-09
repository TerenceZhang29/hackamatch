import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

describe("auth user provisioning", () => {
  it("creates users and profiles rows for a cornell.edu address", async () => {
    const id = await db.createAuthUser("np999@cornell.edu");

    const users = await db.asPostgres(
      "select cornell_email, role from public.users where id = $1",
      [id],
    );
    expect(users.rows).toEqual([{ cornell_email: "np999@cornell.edu", role: null }]);

    const profiles = await db.asPostgres("select user_id from public.profiles where user_id = $1", [
      id,
    ]);
    expect(profiles.rowCount).toBe(1);
  });

  it("rejects an address outside the allowed domains", async () => {
    const error = await db.expectError(() => db.createAuthUser("someone@gmail.com"));
    expect(error?.message).toMatch(/not allowed/);
  });

  it("rejects a lookalike domain", async () => {
    const error = await db.expectError(() => db.createAuthUser("x@notcornell.edu"));
    expect(error?.message).toMatch(/not allowed/);
  });

  it("follows app_settings when the allowed domains change", async () => {
    await db.asPostgres(
      "update public.app_settings set allowed_email_domains = '{cornell.edu,example.edu}'",
    );
    const id = await db.createAuthUser("x@example.edu");
    expect(id).toBeTruthy();
  });

  it("rejects changing an existing email to a disallowed domain", async () => {
    const id = await db.createAuthUser("np998@cornell.edu");
    const error = await db.expectError(() =>
      db.asPostgres("update public.users set cornell_email = 'x@gmail.com' where id = $1", [id]),
    );
    expect(error?.message).toMatch(/not allowed/);
  });
});

describe("matches table", () => {
  it("requires the canonical order user_a < user_b", async () => {
    const a = await db.createAuthUser("pair-a@cornell.edu");
    const b = await db.createAuthUser("pair-b@cornell.edu");
    const [low, high] = a < b ? [a, b] : [b, a];

    const error = await db.expectError(() =>
      db.asPostgres(
        "insert into public.matches (user_a, user_b, source) values ($1, $2, 'admin')",
        [high, low],
      ),
    );
    expect(error?.message).toMatch(/check constraint/);
  });

  it("allows only one match per pair", async () => {
    const a = await db.createAuthUser("pair-c@cornell.edu");
    const b = await db.createAuthUser("pair-d@cornell.edu");
    const [low, high] = a < b ? [a, b] : [b, a];
    const insert = () =>
      db.asPostgres(
        "insert into public.matches (user_a, user_b, source) values ($1, $2, 'board')",
        [low, high],
      );

    await insert();
    const error = await db.expectError(insert);
    expect(error?.message).toMatch(/duplicate key/);
  });
});

describe("notification_log", () => {
  it("allows one digest per user per local date", async () => {
    const id = await db.createAuthUser("digest@cornell.edu");
    const insert = (kind: string) =>
      db.asPostgres(
        `insert into public.notification_log (user_id, channel, kind, local_date)
         values ($1, 'email', $2, '2026-10-09')`,
        [id, kind],
      );

    await insert("digest");
    await insert("mutual"); // transactional emails are not capped by the index
    const error = await db.expectError(() => insert("weekly"));
    expect(error?.message).toMatch(/notification_one_digest_per_day/);
  });
});

describe("active_pool", () => {
  it("includes onboarded, unpaused users only", async () => {
    const active = await db.createAuthUser("active@cornell.edu", { onboarded: true });
    const paused = await db.createAuthUser("paused@cornell.edu", { onboarded: true });
    const fresh = await db.createAuthUser("fresh@cornell.edu");
    await db.asPostgres(
      "update public.users set paused_until = now() + interval '1 day' where id = $1",
      [paused],
    );

    const { rows } = await db.asPostgres<{ id: string }>(
      "select id from public.active_pool where id = any($1)",
      [[active, paused, fresh]],
    );
    expect(rows.map((r) => r.id)).toEqual([active]);
  });
});

describe("seed data", () => {
  it("loads the expected users, events and ideas", async () => {
    const { rows } = await db.asPostgres<{ users: number; events: number; ideas: number }>(
      `select (select count(*)::int from public.users where cornell_email like '%@cornell.edu') as users,
              (select count(*)::int from public.events) as events,
              (select count(*)::int from public.ideas) as ideas`,
    );
    expect(rows[0]).toEqual({ users: 13, events: 3, ideas: 6 });
  });
});
