import { describe, expect, it } from "vitest";
import { canonicalPair, setupTestDb } from "./helpers";

const db = setupTestDb();
const EVENT = "00000000-0000-4000-b000-000000000001";

async function revealedPair(prefix: string) {
  const x = await db.createAuthUser(`${prefix}-x@cornell.edu`, { onboarded: true });
  const y = await db.createAuthUser(`${prefix}-y@cornell.edu`, { onboarded: true });
  const [a, b] = canonicalPair(x, y);
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.matches (user_a, user_b, source, a_response, b_response, revealed_at)
     values ($1, $2, 'board', 'interested', 'interested', now()) returning id`,
    [a, b],
  );
  return { x, y, matchId: rows[0]!.id };
}

describe("team_up", () => {
  it("creates one team per match and event, with both people, however often it runs", async () => {
    const { x, y, matchId } = await revealedPair("tu-a");
    const first = await db.asPostgres<{ team_id: string; created: boolean }>(
      "select * from public.team_up($1, $2, $3)",
      [matchId, EVENT, x],
    );
    const again = await db.asPostgres<{ team_id: string; created: boolean }>(
      "select * from public.team_up($1, $2, $3)",
      [matchId, EVENT, y],
    );
    expect(first.rows[0]!.created).toBe(true);
    expect(again.rows[0]).toEqual({ team_id: first.rows[0]!.team_id, created: false });

    const members = await db.asPostgres<{ user_id: string }>(
      "select user_id from public.team_members where team_id = $1 order by user_id",
      [first.rows[0]!.team_id],
    );
    expect(members.rows.map((r) => r.user_id)).toEqual([x, y].sort());

    const stamped = await db.asPostgres<{ t: boolean }>(
      "select teamed_up_at is not null as t from public.matches where id = $1",
      [matchId],
    );
    expect(stamped.rows[0]!.t).toBe(true);
  });

  it("treats 'no event' as its own team, also only once", async () => {
    const { x, matchId } = await revealedPair("tu-b");
    await db.asPostgres("select public.team_up($1, null, $2)", [matchId, x]);
    await db.asPostgres("select public.team_up($1, null, $2)", [matchId, x]);
    await db.asPostgres("select public.team_up($1, $2, $3)", [matchId, EVENT, x]);
    const { rows } = await db.asPostgres<{ n: number }>(
      "select count(*)::int as n from public.teams where match_id = $1",
      [matchId],
    );
    expect(rows[0]!.n).toBe(2);
  });

  it("refuses an unrevealed match or someone outside it", async () => {
    const { matchId } = await revealedPair("tu-c");
    const stranger = await db.createAuthUser("tu-c-z@cornell.edu", { onboarded: true });
    const outside = await db.expectError(() =>
      db.asPostgres("select public.team_up($1, null, $2)", [matchId, stranger]),
    );
    expect(outside?.message).toMatch(/Not a revealed match/);

    const { x, matchId: hidden } = await revealedPair("tu-d");
    await db.asPostgres("update public.matches set revealed_at = null where id = $1", [hidden]);
    const unrevealed = await db.expectError(() =>
      db.asPostgres("select public.team_up($1, null, $2)", [hidden, x]),
    );
    expect(unrevealed?.message).toMatch(/Not a revealed match/);
  });
});
