import { describe, expect, it } from "vitest";
import { setupTestDb } from "./helpers";

// P1-25: the event detail columns and the who's-going functions.

const db = setupTestDb();

async function event(slug = "db-detail-hack") {
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, 'Detail Hack', current_date + 5, current_date + 6) returning id`,
    [slug],
  );
  return rows[0]!.id;
}

async function going(eventId: string, email: string, skills: string[] = []) {
  const id = await db.createAuthUser(email, { onboarded: true });
  await db.asPostgres(`update public.profiles set skills = $2 where user_id = $1`, [id, skills]);
  await db.asPostgres(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    id,
    eventId,
  ]);
  return id;
}

describe("event detail columns", () => {
  it("are optional, so an event without details still saves", async () => {
    const id = await event();
    const { rows } = await db.asPostgres(
      "select format, level, prizes, tracks, perks from public.events where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ format: null, level: null, prizes: null, tracks: null, perks: [] });
  });

  it("refuse values outside their enums, lists that aren't arrays, and unknown perks", async () => {
    const id = await event();
    for (const set of [
      "format = 'space'",
      "level = 'expert'",
      'prizes = \'{"label": "1st"}\'',
      "perks = '{spa}'",
      "length_hours = 0",
      "entry_fee_cents = -1",
    ]) {
      const error = await db.expectError(() =>
        db.asPostgres(`update public.events set ${set} where id = $1`, [id]),
      );
      expect(error, set).not.toBeNull();
    }
  });

  it("are public to read and admin-only to write", async () => {
    const id = await event();
    await db.asPostgres(
      "update public.events set format = 'online', perks = '{meals}' where id = $1",
      [id],
    );
    const { rows } = await db.asAnon("select format, perks from public.events where id = $1", [id]);
    expect(rows[0]).toEqual({ format: "online", perks: ["meals"] });

    const member = await db.createAuthUser("db-801@cornell.edu", { onboarded: true });
    await db.asUser(member, "update public.events set format = 'hybrid' where id = $1", [id]);
    const after = await db.asPostgres("select format from public.events where id = $1", [id]);
    expect(after.rows[0]!.format).toBe("online");
  });
});

describe("who's going", () => {
  it("counts the event's pool, and who isn't on a team for it yet", async () => {
    const id = await event();
    const a = await going(id, "db-802@cornell.edu");
    const b = await going(id, "db-803@cornell.edu");
    await going(id, "db-804@cornell.edu");
    // Someone who left the pool isn't counted.
    const left = await going(id, "db-805@cornell.edu");
    await db.asPostgres(
      "update public.event_interests set left_pool_at = now() where user_id = $1",
      [left],
    );
    const { rows: team } = await db.asPostgres<{ id: string }>(
      "insert into public.teams (event_id, created_by) values ($1, $2) returning id",
      [id, a],
    );
    await db.asPostgres(
      "insert into public.team_members (team_id, user_id) values ($1, $2), ($1, $3)",
      [team[0]!.id, a, b],
    );

    const { rows } = await db.asService(
      "select going, need_team from public.event_going_stats($1)",
      [[id]],
    );
    expect(rows).toEqual([{ going: 3, need_team: 1 }]);
  });

  it("lists the most common skills, as counts", async () => {
    const id = await event();
    await going(id, "db-806@cornell.edu", ["backend", "ml"]);
    await going(id, "db-807@cornell.edu", ["backend"]);
    await going(id, "db-808@cornell.edu", ["frontend"]);
    const { rows } = await db.asService(
      "select skill, people from public.event_top_skills($1, 2)",
      [id],
    );
    expect(rows).toEqual([
      { skill: "backend", people: 2 },
      { skill: "frontend", people: 1 },
    ]);
  });

  it("is for the server only", async () => {
    const id = await event();
    for (const sql of [
      "select * from public.event_going_stats(array[$1]::uuid[])",
      "select * from public.event_top_skills($1)",
    ]) {
      expect(await db.expectError(() => db.asAnon(sql, [id])), sql).not.toBeNull();
    }
  });
});
