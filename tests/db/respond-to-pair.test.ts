import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type Row = { match_id: string; created: boolean };

describe("respond_to_pair", () => {
  it("creates the canonical row with the actor's answer, then updates only the actor's side", async () => {
    const x = await db.createAuthUser("rp-x@cornell.edu", { onboarded: true });
    const y = await db.createAuthUser("rp-y@cornell.edu", { onboarded: true });

    const first = await db.asPostgres<Row>(
      "select * from public.respond_to_pair($1, $2, null, 'interested', 'board')",
      [y, x],
    );
    expect(first.rows[0]!.created).toBe(true);

    const second = await db.asPostgres<Row>(
      "select * from public.respond_to_pair($1, $2, null, 'pass', 'board')",
      [x, y],
    );
    expect(second.rows[0]).toEqual({ match_id: first.rows[0]!.match_id, created: false });

    const { rows } = await db.asPostgres<{ user_a: string; ya: string; xa: string }>(
      `select user_a,
              case when user_a = $1 then a_response else b_response end::text as ya,
              case when user_a = $2 then a_response else b_response end::text as xa
       from public.matches where id = $3`,
      [y, x, first.rows[0]!.match_id],
    );
    expect(rows[0]!.user_a).toBe(x < y ? x : y);
    expect(rows[0]).toMatchObject({ ya: "interested", xa: "pass" });
  });

  it("refuses a self-match or a pending answer", async () => {
    const x = await db.createAuthUser("rp-z@cornell.edu", { onboarded: true });
    const self = await db.expectError(() =>
      db.asPostgres("select * from public.respond_to_pair($1, $1, null, 'interested', 'board')", [
        x,
      ]),
    );
    expect(self?.message).toMatch(/themselves/);
  });

  it("is not callable by signed-in users", async () => {
    const x = await db.createAuthUser("rp-w@cornell.edu", { onboarded: true });
    const error = await db.expectError(() =>
      db.asUser(x, "select * from public.respond_to_pair($1, $1, null, 'interested', 'board')", [
        x,
      ]),
    );
    expect(error?.message).toMatch(/permission denied/);
  });

  it("counts today's interests for the daily limit", async () => {
    const x = await db.createAuthUser("rp-v@cornell.edu", { onboarded: true });
    for (const n of [1, 2, 3]) {
      const y = await db.createAuthUser(`rp-t${n}@cornell.edu`, { onboarded: true });
      await db.asPostgres("select public.respond_to_pair($1, $2, null, 'interested', 'board')", [
        x,
        y,
      ]);
    }
    const passTarget = await db.createAuthUser("rp-t4@cornell.edu", { onboarded: true });
    await db.asPostgres("select public.respond_to_pair($1, $2, null, 'pass', 'board')", [
      x,
      passTarget,
    ]);

    const { rows } = await db.asPostgres<{ n: number }>(
      "select public.interests_today($1, 'America/New_York') as n",
      [x],
    );
    expect(rows[0]!.n).toBe(3);
  });
});

describe("respond_to_pair under concurrency", () => {
  const clients: pg.Client[] = [];
  afterAll(async () => {
    for (const client of clients) await client.end();
  });

  it("two people answering each other at once produce one row", async () => {
    // Committed data on separate connections, cleaned up at the end.
    const setup = new pg.Client({ connectionString: DATABASE_URL });
    clients.push(setup);
    await setup.connect();
    const ids: string[] = [];
    for (const email of ["race-a@cornell.edu", "race-b@cornell.edu"]) {
      const { rows } = await setup.query<{ id: string }>(
        `insert into auth.users (instance_id, id, aud, role, email)
         values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
                 'authenticated', $1) returning id`,
        [email],
      );
      ids.push(rows[0]!.id);
    }
    try {
      const [left, right] = [new pg.Client(DATABASE_URL), new pg.Client(DATABASE_URL)];
      clients.push(left, right);
      await Promise.all([left.connect(), right.connect()]);
      const results = await Promise.all([
        left.query<Row>(
          "select * from public.respond_to_pair($1, $2, null, 'interested', 'board')",
          [ids[0], ids[1]],
        ),
        right.query<Row>(
          "select * from public.respond_to_pair($1, $2, null, 'interested', 'board')",
          [ids[1], ids[0]],
        ),
      ]);
      const matchIds = new Set(results.map((r) => r.rows[0]!.match_id));
      expect(matchIds.size).toBe(1);
      expect(results.filter((r) => r.rows[0]!.created)).toHaveLength(1);

      const { rows } = await setup.query<{ a: string; b: string }>(
        "select a_response::text as a, b_response::text as b from public.matches where id = $1",
        [[...matchIds][0]],
      );
      expect(rows[0]).toEqual({ a: "interested", b: "interested" });
    } finally {
      await setup.query("delete from auth.users where id = any($1)", [ids]);
    }
  });
});
