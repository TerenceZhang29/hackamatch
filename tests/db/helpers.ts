import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Gives each test a connection inside a transaction that is rolled back
 * afterwards, so tests never leave data behind and never see each other's.
 */
export function setupTestDb() {
  const client = new pg.Client({ connectionString: DATABASE_URL });

  beforeAll(async () => {
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query("begin");
  });
  afterEach(async () => {
    await client.query("rollback");
  });

  return {
    /** Runs SQL as the postgres superuser (bypasses RLS). */
    async asPostgres<T extends pg.QueryResultRow = pg.QueryResultRow>(
      sql: string,
      params?: unknown[],
    ) {
      await client.query("reset role; select set_config('request.jwt.claims', '', true)");
      return client.query<T>(sql, params);
    },
    /** Runs SQL as a logged-out visitor (Supabase `anon` role). */
    async asAnon<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) {
      await client.query(
        `set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true)`,
      );
      // On error the transaction is aborted, so the role is reset by
      // expectError() after it rolls back to its savepoint.
      const result = await client.query<T>(sql, params);
      await client.query("reset role");
      return result;
    },
    /** Runs SQL as a signed-in user (Supabase `authenticated` role). */
    async asUser<T extends pg.QueryResultRow = pg.QueryResultRow>(
      userId: string,
      sql: string,
      params?: unknown[],
    ) {
      const claims = JSON.stringify({ sub: userId, role: "authenticated" });
      await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await client.query("set local role authenticated");
      // On error the transaction is aborted, so the role is reset by
      // expectError() after it rolls back to its savepoint.
      const result = await client.query<T>(sql, params);
      await client.query("reset role");
      return result;
    },
    /**
     * Runs SQL in a savepoint and returns the error it raised (or null). An
     * error inside a transaction aborts it, so expected failures need this.
     */
    async expectError(run: () => Promise<unknown>) {
      await client.query("savepoint expect_error");
      try {
        await run();
        await client.query("release savepoint expect_error");
        return null;
      } catch (error) {
        await client.query("rollback to savepoint expect_error");
        await client.query("reset role");
        return error as Error;
      }
    },
    /** Creates an auth user (the trigger creates users + profiles rows). */
    async createAuthUser(email: string, opts: { onboarded?: boolean } = {}) {
      const id = randomUUID();
      await this.asPostgres(
        `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '{}')`,
        [id, email],
      );
      if (opts.onboarded) {
        await this.asPostgres(
          `update public.users set role = 'builder', intents = '{hackathon}', onboarded_at = now()
           where id = $1`,
          [id],
        );
      }
      return id;
    },
  };
}

/** Orders two user ids the way the matches table requires (user_a < user_b). */
export function canonicalPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}
