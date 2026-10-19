import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

const db = setupTestDb();

/** A private upcoming event, a member who tagged it (with an idea for it), and a second event. */
async function setup() {
  const { rows } = await db.asPostgres<{ id: string; slug: string }>(
    `insert into public.events (slug, name, start_date, end_date) values
       ('db-pool-hack', 'Pool Hack', current_date + 5, current_date + 6),
       ('db-other-hack', 'Other Hack', current_date + 9, current_date + 10)
     returning id, slug`,
  );
  const [hack, other] = [rows[0]!, rows[1]!];
  const person = await db.createAuthUser("db-701@cornell.edu", { onboarded: true });
  await db.asPostgres(
    `insert into public.event_interests (user_id, event_id) values ($1, $2), ($1, $3)`,
    [person, hack.id, other.id],
  );
  const idea = await db.asPostgres<{ id: string }>(
    `insert into public.ideas (owner_id, event_id, raw_text, pitch)
     values ($1, $2, 'A secret plan.', 'A pool test idea.') returning id`,
    [person, hack.id],
  );
  return { person, hackId: hack.id, ideaId: idea.rows[0]!.id };
}

const peopleIn = async (slug: string | null) =>
  (
    await db.asService<{ user_id: string }>(
      "select user_id from public.public_board_people(100, 0, p_event_slug => $1)",
      [slug],
    )
  ).rows.map((r) => r.user_id);
const ideasIn = async (slug: string | null) =>
  (
    await db.asService<{ id: string }>(
      "select id from public.public_board_ideas(100, 0, p_event_slug => $1)",
      [slug],
    )
  ).rows.map((r) => r.id);

describe("event pools", () => {
  it("new interest rows start in the pool with nothing asked yet", async () => {
    const { person, hackId } = await setup();
    const { rows } = await db.asPostgres(
      "select left_pool_at, prompted_matches from public.event_interests where user_id = $1 and event_id = $2",
      [person, hackId],
    );
    expect(rows[0]).toEqual({ left_pool_at: null, prompted_matches: 0 });
  });

  it("leaving one event's pool hides the person and their idea there only", async () => {
    const { person, hackId, ideaId } = await setup();
    expect(await peopleIn("db-pool-hack")).toContain(person);
    expect(await ideasIn("db-pool-hack")).toContain(ideaId);

    await db.asPostgres(
      "update public.event_interests set left_pool_at = now() where user_id = $1 and event_id = $2",
      [person, hackId],
    );
    expect(await peopleIn("db-pool-hack")).not.toContain(person);
    expect(await ideasIn("db-pool-hack")).not.toContain(ideaId);
    // Still on the main board and in the other event's pool.
    expect(await peopleIn(null)).toContain(person);
    expect(await ideasIn(null)).toContain(ideaId);
    expect(await peopleIn("db-other-hack")).toContain(person);

    await db.asPostgres(
      "update public.event_interests set left_pool_at = null where user_id = $1 and event_id = $2",
      [person, hackId],
    );
    expect(await peopleIn("db-pool-hack")).toContain(person);
    expect(await ideasIn("db-pool-hack")).toContain(ideaId);
  });

  it("prompted_matches can't go negative", async () => {
    const { person, hackId } = await setup();
    const error = await db.expectError(() =>
      db.asPostgres(
        "update public.event_interests set prompted_matches = -1 where user_id = $1 and event_id = $2",
        [person, hackId],
      ),
    );
    expect(error?.message).toMatch(/check constraint/);
  });
});
