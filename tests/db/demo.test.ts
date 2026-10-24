import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

/** A demo person as supabase/demo/seed.sql makes one: no email in auth.users. */
async function createDemo(name: string) {
  const id = randomUUID();
  await db.asPostgres("set local hackamatch.demo_seed = 'on'");
  await db.asPostgres(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', null,
             jsonb_build_object('name', $2::text, 'demo_email', $3::text))`,
    [id, name, `demo-${id.slice(0, 8)}@hackamatch.invalid`],
  );
  await db.asPostgres("set local hackamatch.demo_seed = 'off'");
  await db.asPostgres(
    `update public.users set is_demo = true, role = 'both',
       onboarded_at = now(), notify_channel = 'none' where id = $1`,
    [id],
  );
  return { id };
}

describe("demo profiles", () => {
  it("new users are not demo", async () => {
    const id = await db.createAuthUser("db-801@cornell.edu");
    const { rows } = await db.asPostgres("select is_demo from public.users where id = $1", [id]);
    expect(rows[0]).toEqual({ is_demo: false });
  });

  it("the demo domain is refused outside the demo seed", async () => {
    const error = await db.expectError(() =>
      db.asPostgres(
        `insert into auth.users (instance_id, id, aud, role, email)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'demo-x@hackamatch.invalid')`,
        [randomUUID()],
      ),
    );
    expect(error?.message).toMatch(/not allowed/);
  });

  it("demo accounts have no email for Supabase Auth, only in public.users", async () => {
    const { id } = await createDemo("Demo Person");
    const { rows } = await db.asPostgres<{ auth_email: string | null; app_email: string }>(
      `select a.email as auth_email, u.cornell_email as app_email
       from auth.users a join public.users u on u.id = a.id where a.id = $1`,
      [id],
    );
    expect(rows[0]!.auth_email).toBeNull();
    expect(rows[0]!.app_email).toMatch(/@hackamatch\.invalid$/);
  });

  it("show_demo = false hides demo people everywhere; the pool never has them", async () => {
    const { id } = await createDemo("Demo Hidden");
    const visible = async () => ({
      people: (
        await db.asService("select 1 from public.public_board_people(100, 0) where user_id = $1", [
          id,
        ])
      ).rowCount,
      person: (await db.asService("select 1 from public.public_person($1)", [id])).rowCount,
    });
    expect(await visible()).toEqual({ people: 1, person: 1 });

    await db.asPostgres("update public.app_settings set show_demo = false");
    expect(await visible()).toEqual({ people: 0, person: 0 });

    const pool = await db.asPostgres("select 1 from public.active_pool where id = $1", [id]);
    expect(pool.rowCount).toBe(0);
  });
});

describe("event organizer email", () => {
  it("links an event to its organizer when they sign up later", async () => {
    const { rows } = await db.asPostgres<{ id: string }>(
      `insert into public.events (slug, name, start_date, end_date, organizer_email)
       values ('db-org-hack', 'Org Hack', current_date + 5, current_date + 6, 'db-802@cornell.edu')
       returning id`,
    );
    const eventId = rows[0]!.id;
    const before = await db.asPostgres("select organizer_id from public.events where id = $1", [
      eventId,
    ]);
    expect(before.rows[0]).toEqual({ organizer_id: null });

    const userId = await db.createAuthUser("DB-802@cornell.edu");
    const after = await db.asPostgres("select organizer_id from public.events where id = $1", [
      eventId,
    ]);
    expect(after.rows[0]).toEqual({ organizer_id: userId });
  });

  it("rejects a malformed organizer email", async () => {
    const error = await db.expectError(() =>
      db.asPostgres(
        `insert into public.events (slug, name, start_date, end_date, organizer_email)
         values ('db-bad-org', 'Bad Org', current_date + 5, current_date + 6, 'not an email')`,
      ),
    );
    expect(error?.message).toMatch(/check constraint/);
  });
});
