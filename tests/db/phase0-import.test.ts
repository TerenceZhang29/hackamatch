import { spawnSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real import CLI (pnpm import:phase0) against the local database
 * with the fixtures in tests/fixtures/phase0, then cleans up. Needs .env.local
 * from `pnpm db:env` and the fake LLM and embedder.
 */

const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const FIXTURES = "tests/fixtures/phase0";
const EMAILS = ["p0-001@cornell.edu", "p0-002@cornell.edu"];
const SEED_IDEA = "A study-group finder that matches classmates by schedule";

const client = new pg.Client({ connectionString: DATABASE_URL });

function runImport(...extra: string[]) {
  const result = spawnSync(
    "pnpm",
    [
      "--silent",
      "import:phase0",
      "--signups",
      `${FIXTURES}/signups.csv`,
      "--ideas",
      `${FIXTURES}/seed_ideas.csv`,
      "--matches",
      `${FIXTURES}/matches.csv`,
      ...extra,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, LLM_PROVIDER: "fake", EMBEDDINGS_PROVIDER: "fake" },
    },
  );
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

async function cleanup() {
  await client.query("delete from public.ideas where raw_text = $1", [SEED_IDEA]);
  await client.query("delete from auth.users where email = any($1)", [EMAILS]);
}

const counts = async () =>
  (
    await client.query<{ users: number; ideas: number; matches: number; teams: number }>(
      `select (select count(*)::int from public.users where cornell_email = any($1)) as users,
              (select count(*)::int from public.ideas i join public.users u on u.id = i.owner_id
               where u.cornell_email = any($1) or i.raw_text = $2) as ideas,
              (select count(*)::int from public.matches m join public.users u on u.id = m.user_a
               where u.cornell_email = any($1)) as matches,
              (select count(*)::int from public.teams t join public.matches m on m.id = t.match_id
               join public.users u on u.id = m.user_a where u.cornell_email = any($1)) as teams`,
      [EMAILS, SEED_IDEA],
    )
  ).rows[0]!;

beforeAll(async () => {
  await client.connect();
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await client.end();
});

describe("pnpm import:phase0", () => {
  it("dry run reports what it would do and writes nothing", () => {
    const { output } = runImport("--dry-run");
    expect(output).toContain("Dry run: nothing was written.");
    expect(output).toContain("would create p0-001@cornell.edu (idea)");
    expect(output).toContain("signups line 4: email: not an email address");
    expect(output).toContain(
      "Unknown events (create them in /admin/events, then re-run): Mystery Hackathon",
    );
    return counts().then((c) => expect(c).toEqual({ users: 0, ideas: 0, matches: 0, teams: 0 }));
  }, 60_000);

  it("imports sign-ups, seed ideas and matches, then is a no-op the second time", async () => {
    const first = runImport();
    expect(first.output).toContain("Import finished.");
    // The broken sign-up row makes the exit code non-zero, but everything else is imported.
    expect(first.status).toBe(1);
    expect(await counts()).toEqual({ users: 2, ideas: 2, matches: 1, teams: 1 });

    const { rows } = await client.query<{
      email: string;
      role: string;
      onboarded: boolean;
      embedded: boolean;
      linkedin_url: string | null;
      events: number;
    }>(
      `select u.cornell_email as email, u.role::text, u.onboarded_at is not null as onboarded,
              p.embedding is not null as embedded, u.linkedin_url,
              (select count(*)::int from public.event_interests ei where ei.user_id = u.id) as events
       from public.users u join public.profiles p on p.user_id = u.id
       where u.cornell_email = any($1) order by u.cornell_email`,
      [EMAILS],
    );
    expect(rows).toEqual([
      {
        email: "p0-001@cornell.edu",
        role: "idea",
        onboarded: true,
        embedded: true,
        linkedin_url: null,
        events: 1,
      },
      {
        email: "p0-002@cornell.edu",
        role: "builder",
        onboarded: true,
        embedded: true,
        linkedin_url: "https://www.linkedin.com/in/sofia-import",
        events: 1,
      },
    ]);

    const [seed] = (
      await client.query<{ featured: boolean; admin_owned: boolean }>(
        `select i.featured, u.is_admin as admin_owned from public.ideas i
         join public.users u on u.id = i.owner_id where i.raw_text = $1`,
        [SEED_IDEA],
      )
    ).rows;
    expect(seed).toEqual({ featured: true, admin_owned: true });

    const [match] = (
      await client.query<{ source: string; revealed: boolean; has_idea: boolean }>(
        `select m.source::text, m.revealed_at is not null as revealed, m.idea_id is not null as has_idea
         from public.matches m join public.users u on u.id in (m.user_a, m.user_b)
         where u.cornell_email = 'p0-001@cornell.edu'`,
      )
    ).rows;
    expect(match).toEqual({ source: "admin", revealed: true, has_idea: true });

    const second = runImport();
    expect(second.output).toContain("Import finished.");
    expect(await counts()).toEqual({ users: 2, ideas: 2, matches: 1, teams: 1 });
  }, 120_000);
});
