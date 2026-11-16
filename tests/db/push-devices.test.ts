import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();
const token = (char: string) => char.repeat(64);

describe("push_devices", () => {
  it("is server-only: visitors and members can't read or write it", async () => {
    const userId = await db.createAuthUser("db-601@cornell.edu", { onboarded: true });
    const read = await db.expectError(() => db.asUser(userId, "select * from public.push_devices"));
    expect(read?.message).toMatch(/permission denied/);
    const write = await db.expectError(() =>
      db.asUser(
        userId,
        `insert into public.push_devices (token, user_id, environment) values ($1, $2, 'sandbox')`,
        [token("a"), userId],
      ),
    );
    expect(write?.message).toMatch(/permission denied/);
    const anon = await db.expectError(() => db.asAnon("select * from public.push_devices"));
    expect(anon?.message).toMatch(/permission denied/);
  });

  it("takes lowercase hex tokens for sandbox or production, and goes with the account", async () => {
    const userId = await db.createAuthUser("db-602@cornell.edu", { onboarded: true });
    const insert = (value: string, environment = "production") =>
      db.asService(
        `insert into public.push_devices (token, user_id, environment) values ($1, $2, $3)`,
        [value, userId, environment],
      );
    await insert(token("b"));
    expect((await db.expectError(() => insert("ABC")))?.message).toMatch(
      /push_devices_token_check/,
    );
    expect((await db.expectError(() => insert(token("c"), "staging")))?.message).toMatch(
      /push_devices_environment_check/,
    );
    await db.asPostgres("delete from auth.users where id = $1", [userId]);
    expect((await db.asPostgres("select 1 from public.push_devices")).rows).toEqual([]);
  });

  it("logs pushes in notification_log on their own channel", async () => {
    const userId = await db.createAuthUser("db-603@cornell.edu", { onboarded: true });
    await db.asService(
      `insert into public.notification_log (user_id, channel, kind, local_date)
       values ($1, 'push', 'mutual', current_date)`,
      [userId],
    );
    const { rows } = await db.asPostgres(
      "select channel from public.notification_log where user_id = $1",
      [userId],
    );
    expect(rows).toEqual([{ channel: "push" }]);
  });
});
