import { describe, expect, it } from "vitest";
import { canonicalPair, setupTestDb } from "./helpers";

const db = setupTestDb();

const PERMISSION_DENIED = /permission denied/;

async function createIdea(ownerId: string, rawText = "A secret plan for a health app.") {
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.ideas (owner_id, raw_text, pitch, skills_needed)
     values ($1, $2, 'A short public pitch.', '{frontend}') returning id`,
    [ownerId, rawText],
  );
  return rows[0]!.id;
}

async function createMatch(
  x: string,
  y: string,
  opts: { ideaId?: string; revealed?: boolean } = {},
) {
  const [a, b] = canonicalPair(x, y);
  const { rows } = await db.asPostgres<{ id: string }>(
    `insert into public.matches (user_a, user_b, idea_id, source, a_response, b_response, revealed_at)
     values ($1, $2, $3, 'board', $4, $4, $5) returning id`,
    [
      a,
      b,
      opts.ideaId ?? null,
      opts.revealed ? "interested" : "pending",
      opts.revealed ? new Date() : null,
    ],
  );
  return rows[0]!.id;
}

describe("anon (logged-out visitors)", () => {
  it("cannot read users, profiles, ideas or matches directly", async () => {
    for (const table of ["users", "profiles", "ideas", "matches", "event_interests"]) {
      const error = await db.expectError(() => db.asAnon(`select * from public.${table}`));
      expect(error?.message, table).toMatch(PERMISSION_DENIED);
    }
  });

  it("can read events and app settings", async () => {
    const events = await db.asAnon("select id from public.events");
    expect(events.rowCount).toBe(3);
    const settings = await db.asAnon<{ allowed_email_domains: string[] }>(
      "select allowed_email_domains from public.app_settings",
    );
    expect(settings.rows[0]?.allowed_email_domains).toEqual(["cornell.edu"]);
  });

  it("sees open seeded ideas on the board without private fields", async () => {
    const { rows, fields } = await db.asAnon("select * from public.public_board_ideas(20, 0)");
    expect(rows).toHaveLength(5);
    expect(fields.map((f) => f.name).sort()).toEqual(
      [
        "created_at",
        "domain",
        "event_id",
        "featured",
        "id",
        "owner_display",
        "pitch",
        "scope",
        "skills_needed",
      ].sort(),
    );
    expect(rows[0]).toMatchObject({ featured: true, owner_display: "Maya P." });
  });

  it("filters board ideas by event and caps the page size", async () => {
    const byEvent = await db.asAnon(
      "select id from public.public_board_ideas(20, 0, 'cornell-tech-fall-hack')",
    );
    expect(byEvent.rowCount).toBe(3);
    const capped = await db.asAnon("select id from public.public_board_ideas(1000, 0)");
    expect(capped.rowCount).toBe(5);
  });

  it("hides ideas from paused or not-yet-onboarded owners", async () => {
    const owner = await db.createAuthUser("owner@cornell.edu", { onboarded: true });
    const ideaId = await createIdea(owner);
    const visible = () =>
      db.asAnon("select id from public.public_board_ideas(100, 0) where id = $1", [ideaId]);

    expect((await visible()).rowCount).toBe(1);
    await db.asPostgres(
      "update public.users set paused_until = now() + interval '7 days' where id = $1",
      [owner],
    );
    expect((await visible()).rowCount).toBe(0);
  });

  it("sees people on the board with display names and no contact details", async () => {
    const { rows, fields } = await db.asAnon<{ display_name: string; role: string }>(
      "select * from public.public_board_people(50, 0)",
    );
    // 11 onboarded seed users, minus Lena (paused).
    expect(rows).toHaveLength(10);
    expect(fields.map((f) => f.name)).not.toContain("cornell_email");
    expect(rows.map((r) => r.display_name)).toContain("Sofia C.");
    expect(rows.map((r) => r.display_name)).not.toContain("Lena H.");
  });

  it("filters people by role, counting 'both' on either side", async () => {
    const builders = await db.asAnon<{ role: string }>(
      "select role from public.public_board_people(50, 0, 'builder')",
    );
    expect(new Set(builders.rows.map((r) => r.role))).toEqual(new Set(["builder", "both"]));
  });
});

describe("users and profiles", () => {
  it("a user sees only their own row", async () => {
    const a = await db.createAuthUser("ua@cornell.edu");
    await db.createAuthUser("ub@cornell.edu");
    const { rows } = await db.asUser<{ id: string }>(a, "select id from public.users");
    expect(rows.map((r) => r.id)).toEqual([a]);
  });

  it("an admin sees every user", async () => {
    const { rows } = await db.asUser(
      "00000000-0000-4000-a000-000000000001",
      "select id from public.users",
    );
    expect(rows.length).toBeGreaterThanOrEqual(13);
  });

  it("a user can edit their profile fields but not privileged columns", async () => {
    const a = await db.createAuthUser("uc@cornell.edu");
    await db.asUser(
      a,
      "update public.users set name = 'New Name', role = 'builder' where id = $1",
      [a],
    );
    const { rows } = await db.asPostgres("select name, role from public.users where id = $1", [a]);
    expect(rows[0]).toEqual({ name: "New Name", role: "builder" });

    for (const column of [
      "is_admin = true",
      "is_organizer = true",
      "cornell_email = 'z@cornell.edu'",
    ]) {
      const error = await db.expectError(() =>
        db.asUser(a, `update public.users set ${column} where id = $1`, [a]),
      );
      expect(error?.message, column).toMatch(PERMISSION_DENIED);
    }
  });

  it("a user cannot update someone else's row", async () => {
    const a = await db.createAuthUser("ud@cornell.edu");
    const b = await db.createAuthUser("ue@cornell.edu");
    const result = await db.asUser(a, "update public.users set name = 'Hacked' where id = $1", [b]);
    expect(result.rowCount).toBe(0);
  });

  it("a user can edit their tags but not their embedding", async () => {
    const a = await db.createAuthUser("uf@cornell.edu");
    const updated = await db.asUser(
      a,
      "update public.profiles set skills = '{frontend}', user_edited = true where user_id = $1",
      [a],
    );
    expect(updated.rowCount).toBe(1);

    const error = await db.expectError(() =>
      db.asUser(a, "update public.profiles set embedding = null where user_id = $1", [a]),
    );
    expect(error?.message).toMatch(PERMISSION_DENIED);
  });
});

describe("ideas", () => {
  it("non-owners cannot read an idea's raw_text until a match is revealed", async () => {
    const owner = await db.createAuthUser("io@cornell.edu", { onboarded: true });
    const other = await db.createAuthUser("ip@cornell.edu", { onboarded: true });
    const ideaId = await createIdea(owner);
    const read = () =>
      db.asUser(other, "select raw_text from public.ideas where id = $1", [ideaId]);

    expect((await read()).rowCount).toBe(0);

    const matchId = await createMatch(owner, other, { ideaId });
    expect((await read()).rowCount).toBe(0);

    await db.asPostgres("update public.matches set revealed_at = now() where id = $1", [matchId]);
    expect((await read()).rows).toEqual([{ raw_text: "A secret plan for a health app." }]);
  });

  it("owners can create and edit their ideas but not feature them", async () => {
    const owner = await db.createAuthUser("iq@cornell.edu");
    const other = await db.createAuthUser("ir@cornell.edu");

    const { rows } = await db.asUser<{ id: string }>(
      owner,
      "insert into public.ideas (owner_id, raw_text) values ($1, 'My idea') returning id",
      [owner],
    );
    const ideaId = rows[0]!.id;

    const spoof = await db.expectError(() =>
      db.asUser(other, "insert into public.ideas (owner_id, raw_text) values ($1, 'Spoofed')", [
        owner,
      ]),
    );
    expect(spoof?.message).toMatch(/row-level security/);

    const feature = await db.expectError(() =>
      db.asUser(owner, "update public.ideas set featured = true where id = $1", [ideaId]),
    );
    expect(feature?.message).toMatch(PERMISSION_DENIED);
  });
});

describe("matches", () => {
  it("a user sees only matches they are in", async () => {
    const a = await db.createAuthUser("ma@cornell.edu");
    const b = await db.createAuthUser("mb@cornell.edu");
    const c = await db.createAuthUser("mc@cornell.edu");
    const ab = await createMatch(a, b);
    const bc = await createMatch(b, c);

    const seenByA = await db.asUser<{ id: string }>(a, "select id from public.matches");
    expect(seenByA.rows.map((r) => r.id)).toEqual([ab]);

    const seenByB = await db.asUser<{ id: string }>(b, "select id from public.matches");
    expect(seenByB.rows.map((r) => r.id).sort()).toEqual([ab, bc].sort());
  });

  it("users cannot write matches directly", async () => {
    const a = await db.createAuthUser("md@cornell.edu");
    const b = await db.createAuthUser("me@cornell.edu");
    const [low, high] = canonicalPair(a, b);
    const error = await db.expectError(() =>
      db.asUser(a, "insert into public.matches (user_a, user_b, source) values ($1, $2, 'board')", [
        low,
        high,
      ]),
    );
    expect(error?.message).toMatch(PERMISSION_DENIED);
  });

  it("only members of a revealed match can vote on events for it", async () => {
    const a = await db.createAuthUser("mf@cornell.edu");
    const b = await db.createAuthUser("mg@cornell.edu");
    const outsider = await db.createAuthUser("mh@cornell.edu");
    const matchId = await createMatch(a, b);
    const eventId = "00000000-0000-4000-b000-000000000001";
    const vote = (userId: string) =>
      db.asUser(
        userId,
        "insert into public.match_event_votes (match_id, user_id, event_id) values ($1, $2, $3)",
        [matchId, userId, eventId],
      );

    expect(await db.expectError(() => vote(a))).not.toBeNull(); // not revealed yet
    await db.asPostgres("update public.matches set revealed_at = now() where id = $1", [matchId]);
    expect(await db.expectError(() => vote(a))).toBeNull();
    expect(await db.expectError(() => vote(outsider))).not.toBeNull();
  });
});

describe("events and event interests", () => {
  it("only organizers and admins can create events", async () => {
    const student = await db.createAuthUser("ea@cornell.edu");
    const insert = (userId: string) =>
      db.asUser(
        userId,
        `insert into public.events (slug, name, start_date, end_date, organizer_id)
         values ('new-hack-' || left(md5($1::text), 6), 'New Hack', current_date + 10, current_date + 11, $1::uuid)`,
        [userId],
      );

    const denied = await db.expectError(() => insert(student));
    expect(denied?.message).toMatch(/row-level security/);

    await db.asPostgres("update public.users set is_organizer = true where id = $1", [student]);
    expect(await db.expectError(() => insert(student))).toBeNull();
  });

  it("organizers see interest in their own events only", async () => {
    const organizer = await db.createAuthUser("eb@cornell.edu");
    const student = await db.createAuthUser("ec@cornell.edu");
    await db.asPostgres("update public.users set is_organizer = true where id = $1", [organizer]);
    const { rows } = await db.asPostgres<{ id: string }>(
      `insert into public.events (slug, name, start_date, end_date, organizer_id)
       values ('org-hack', 'Org Hack', current_date + 5, current_date + 6, $1) returning id`,
      [organizer],
    );
    const ownEvent = rows[0]!.id;
    const otherEvent = "00000000-0000-4000-b000-000000000001";

    await db.asUser(
      student,
      "insert into public.event_interests (user_id, event_id) values ($1, $2)",
      [student, ownEvent],
    );
    await db.asUser(
      student,
      "insert into public.event_interests (user_id, event_id) values ($1, $2)",
      [student, otherEvent],
    );

    const seen = await db.asUser<{ event_id: string }>(
      organizer,
      "select event_id from public.event_interests where user_id = $1",
      [student],
    );
    expect(seen.rows.map((r) => r.event_id)).toEqual([ownEvent]);
  });
});

describe("operational tables", () => {
  it("are hidden from regular users", async () => {
    const a = await db.createAuthUser("oa@cornell.edu");
    await db.asPostgres(
      `insert into public.notification_log (user_id, channel, kind, local_date)
         values ($1, 'email', 'mutual', current_date);
       insert into public.match_runs (run_date, mode, weights) values (current_date, 'algorithm', '{}');
       insert into public.analytics_events (user_id, name) values ($1, 'pool_joined');`.replaceAll(
        "$1",
        `'${a}'`,
      ),
    );
    for (const table of ["notification_log", "match_runs", "analytics_events"]) {
      const { rowCount } = await db.asUser(a, `select * from public.${table}`);
      expect(rowCount, table).toBe(0);
    }

    const admin = await db.asUser(
      "00000000-0000-4000-a000-000000000001",
      "select id from public.analytics_events where user_id = $1",
      [a],
    );
    expect(admin.rowCount).toBe(1);
  });
});
