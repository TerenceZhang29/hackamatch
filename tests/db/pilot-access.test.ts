import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

const gate = (on: boolean) => db.asPostgres("update public.app_settings set pilot_only = $1", [on]);
const allow = (netid: string) =>
  db.asPostgres("insert into public.pilot_access (netid) values ($1)", [netid]);
const canSignIn = async (email: string) =>
  (await db.asService<{ ok: boolean }>("select public.pilot_can_sign_in($1) as ok", [email]))
    .rows[0]!.ok;

describe("pilot access", () => {
  it("is off by default, so anyone on an allowed domain can sign up", async () => {
    const { rows } = await db.asPostgres("select pilot_only from public.app_settings");
    expect(rows[0]).toEqual({ pilot_only: false });
    expect(await canSignIn("db-901@cornell.edu")).toBe(true);
    await db.createAuthUser("db-901@cornell.edu");
  });

  it("when on, refuses a new account whose netID isn't listed", async () => {
    await gate(true);
    expect(await canSignIn("db-902@cornell.edu")).toBe(false);
    const error = await db.expectError(() => db.createAuthUser("db-902@cornell.edu"));
    expect(error?.message).toMatch(/Not on the pilot list/);
  });

  it("when on, lets a listed netID sign up, in any letter case", async () => {
    await gate(true);
    await allow("db-903");
    expect(await canSignIn("DB-903@cornell.edu")).toBe(true);
    await db.createAuthUser("Db-903@cornell.edu");
  });

  it("when on, keeps existing accounts signing in, even if not listed", async () => {
    await db.createAuthUser("db-904@cornell.edu");
    await gate(true);
    expect(await canSignIn("db-904@cornell.edu")).toBe(true);
  });

  it("doesn't block the demo seed", async () => {
    await gate(true);
    await db.asPostgres("set local hackamatch.demo_seed = 'on'");
    await db.asPostgres(
      `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', null,
               jsonb_build_object('demo_email', 'demo-pilot@hackamatch.invalid'))`,
      [randomUUID()],
    );
    await db.asPostgres("set local hackamatch.demo_seed = 'off'");
  });

  it("refuses malformed netIDs", async () => {
    const error = await db.expectError(() => allow("not valid@x"));
    expect(error?.message).toMatch(/check constraint/);
  });

  it("is server-only: visitors and members can't read the list or ask the check", async () => {
    await allow("db-905");
    const userId = await db.createAuthUser("db-906@cornell.edu");
    const anonRows = await db.expectError(() => db.asAnon("select * from public.pilot_access"));
    expect(anonRows?.message).toMatch(/permission denied/);
    const userRows = await db.expectError(() =>
      db.asUser(userId, "select * from public.pilot_access"),
    );
    expect(userRows?.message).toMatch(/permission denied/);
    for (const run of [
      () => db.asAnon("select public.pilot_can_sign_in('db-905@cornell.edu')"),
      () => db.asUser(userId, "select public.pilot_can_sign_in('db-905@cornell.edu')"),
    ]) {
      const error = await db.expectError(run);
      expect(error?.message).toMatch(/permission denied/);
    }
  });
});
