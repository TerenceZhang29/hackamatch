import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import type { z } from "zod";
import {
  blocksSchema,
  deckAnswerSchema,
  deckSchema,
  deckUndoSchema,
  errorSchema,
  eventSchema,
  eventsSchema,
  matchAnswerSchema,
  matchesSchema,
  meSchema,
  okSchema,
  pairSchema,
  personPageSchema,
  sessionSchema,
  taxonomySchema,
  teamUpSchema,
} from "@/lib/api/schemas";
import { countMail, deleteUser, getSignInCode, getUserRow, query, uniqueEmail } from "./helpers";

/**
 * The iOS app's JSON API (docs/plans/ios-app.md), called the way the app
 * calls it: no cookies, a bearer token, JSON in and out. Every response is
 * checked against the contract in src/lib/api/schemas.ts.
 */

const API = "/api/v1";

/** The response's JSON checked against the contract; fails on any missing or extra field. */
async function body<S extends z.ZodType>(
  response: APIResponse,
  schema: S,
  status = 200,
): Promise<z.output<S>> {
  expect(response.status(), await response.text()).toBe(status);
  return schema.parse(await response.json());
}

async function errorCode(response: APIResponse, status: number): Promise<string> {
  return (await body(response, errorSchema, status)).error.code;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Accounts this worker's current test made; removed afterwards so the database tests still see only the seed. */
const created: string[] = [];
test.afterEach(async () => {
  await Promise.all(created.splice(0).map(deleteUser));
});

/** Asks for a sign-in email and trades its code for a session, as the app does. */
async function signIn(request: APIRequestContext, email: string) {
  created.push(email);
  const before = await countMail(email);
  await body(await request.post(`${API}/auth/request`, { data: { email } }), okSchema);
  const code = await getSignInCode(email, { after: before });
  const session = await body(
    await request.post(`${API}/auth/verify`, { data: { email, code } }),
    sessionSchema,
  );
  return { session, code, headers: bearer(session.accessToken) };
}

/** Signs a new address in through the API, then puts them in the pool, skipping sign-up. */
async function member(request: APIRequestContext, name: string) {
  const email = uniqueEmail();
  const signedIn = await signIn(request, email);
  const [row] = await query<{ id: string }>(
    `update public.users set name = $2, role = 'builder', raw_bio = 'Test user', onboarded_at = now()
     where cornell_email = $1 returning id`,
    [email, name],
  );
  return { id: row!.id, email, ...signedIn };
}

test("signs in with the emailed code, joins, refreshes and signs out", async ({ request }) => {
  const email = uniqueEmail();
  created.push(email);
  const before = await countMail(email);
  await body(await request.post(`${API}/auth/request`, { data: { email } }), okSchema);
  const code = await getSignInCode(email, { after: before });

  // A wrong code is refused and leaves the right one usable.
  const wrong = code === "000000" ? "000001" : "000000";
  expect(
    await errorCode(
      await request.post(`${API}/auth/verify`, { data: { email, code: wrong } }),
      401,
    ),
  ).toBe("invalid_code");
  const session = await body(
    await request.post(`${API}/auth/verify`, { data: { email, code } }),
    sessionSchema,
  );
  expect(session.expiresAt).toBeGreaterThan(Date.now() / 1000);
  // The code works once.
  expect(
    await errorCode(await request.post(`${API}/auth/verify`, { data: { email, code } }), 401),
  ).toBe("invalid_code");
  expect((await getUserRow(email))?.onboarding_started_at).not.toBeNull();

  // Signed in but not joined: /me works, member routes don't.
  const headers = bearer(session.accessToken);
  const fresh = await body(await request.get(`${API}/me`, { headers }), meSchema);
  expect(fresh).toMatchObject({ email, onboarded: false, firstName: "" });
  expect(await errorCode(await request.get(`${API}/deck`, { headers }), 403)).toBe("not_onboarded");

  // Bad answers are refused with the schema's own wording.
  const refused = await body(
    await request.post(`${API}/signup`, {
      headers,
      data: { firstName: "", undecided: true, domains: ["climate"], skills: ["ml"] },
    }),
    errorSchema,
    400,
  );
  expect(refused.error).toEqual({ code: "bad_request", message: "Add your first name" });

  const joined = await body(
    await request.post(`${API}/signup`, {
      headers,
      data: {
        firstName: "Ada",
        lastName: "Lovelace",
        undecided: true,
        domains: ["climate"],
        skills: ["ml", "react"],
      },
    }),
    meSchema,
  );
  expect(joined).toMatchObject({
    onboarded: true,
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: "Ada L.",
    areas: [{ slug: "climate", label: "Climate" }],
    eventIds: [],
    pause: null,
  });
  expect(joined.skills.map((skill) => skill.slug).sort()).toEqual(["ml", "react"]);
  await body(await request.get(`${API}/deck`, { headers }), deckSchema);

  // A refresh gives a session that works; signing out ends it.
  const refreshed = await body(
    await request.post(`${API}/auth/refresh`, { data: { refreshToken: session.refreshToken } }),
    sessionSchema,
  );
  const next = bearer(refreshed.accessToken);
  await body(await request.get(`${API}/me`, { headers: next }), meSchema);
  await body(await request.post(`${API}/auth/signout`, { headers: next }), okSchema);
  expect(
    await errorCode(
      await request.post(`${API}/auth/refresh`, { data: { refreshToken: refreshed.refreshToken } }),
      401,
    ),
  ).toBe("unauthorized");
});

test("refuses addresses outside the allowed domains before any email", async ({ request }) => {
  const email = uniqueEmail("gmail.com");
  const refused = await body(
    await request.post(`${API}/auth/request`, { data: { email } }),
    errorSchema,
    422,
  );
  expect(refused.error).toEqual({ code: "refused", message: "Use your @cornell.edu email" });
  expect(await countMail(email)).toBe(0);
  expect(await errorCode(await request.post(`${API}/auth/request`, { data: {} }), 400)).toBe(
    "bad_request",
  );
});

test("member routes need a valid bearer token", async ({ request }) => {
  const routes = ["/me", "/deck", "/matches", `/people/${crypto.randomUUID()}`];
  for (const route of routes) {
    expect(await errorCode(await request.get(`${API}${route}`), 401), route).toBe("unauthorized");
    expect(
      await errorCode(await request.get(`${API}${route}`, { headers: bearer("not-a-token") }), 401),
      route,
    ).toBe("unauthorized");
  }
  expect(
    await errorCode(
      await request.post(`${API}/deck/answer`, {
        data: { userId: crypto.randomUUID(), response: "interested" },
      }),
      401,
    ),
  ).toBe("unauthorized");
});

test("the taxonomy and events are public, without member-only facts", async ({ request }) => {
  const taxonomy = await body(await request.get(`${API}/taxonomy`), taxonomySchema);
  expect(taxonomy.areas.find((area) => area.slug === "climate")).toMatchObject({
    label: "Climate",
    featured: true,
  });
  expect(taxonomy.skills.find((skill) => skill.slug === "pitching")?.group).toBe("business");
  expect(taxonomy).toMatchObject({ maxAreas: 5, maxSkills: 3 });

  const { events } = await body(await request.get(`${API}/events`), eventsSchema);
  expect(events.length).toBeGreaterThan(0);
  expect(events.every((event) => !event.going && event.needTeamCount === null)).toBe(true);

  const event = await body(await request.get(`${API}/events/${events[0]!.slug}`), eventSchema);
  expect(event).toMatchObject({
    id: events[0]!.id,
    pool: null,
    needTeamCount: null,
    faces: [],
    tracks: [],
    tools: null,
    topSkills: [],
  });
  expect(await errorCode(await request.get(`${API}/events/no-such-event`), 404)).toBe("not_found");
});

test("two members match through the deck and team up", async ({ request }) => {
  const [a, b, outsider] = await Promise.all([
    member(request, "Ana Api"),
    member(request, "Ben Api"),
    member(request, "Cy Api"),
  ]);

  const deck = await body(await request.get(`${API}/deck`, { headers: a.headers }), deckSchema);
  expect(deck.cards.some((card) => card.id === a.id)).toBe(false);
  expect(deck.cards.length).toBeGreaterThan(0);

  // A person's card never carries contact details.
  const card = await request.get(`${API}/people/${b.id}`, { headers: a.headers });
  expect(await card.text()).not.toContain(b.email);
  expect(await body(card, personPageSchema)).toMatchObject({
    person: { id: b.id, displayName: "Ben A." },
    status: "none",
    matchId: null,
  });
  expect(
    await errorCode(await request.get(`${API}/people/${a.id}`, { headers: a.headers }), 404),
  ).toBe("not_found");

  // Pass hides the card and can be undone, once.
  const answer = (headers: Record<string, string>, userId: string, response: string) =>
    request.post(`${API}/deck/answer`, { headers, data: { userId, response } });
  const passed = await body(await answer(a.headers, b.id, "pass"), deckAnswerSchema);
  expect(passed).toMatchObject({ response: "pass", matchId: null, matchedName: null });
  const undo = () =>
    request.post(`${API}/deck/undo`, { headers: a.headers, data: { undoToken: passed.undoToken } });
  expect(await body(await undo(), deckUndoSchema)).toEqual({ undone: true });
  expect(await body(await undo(), deckUndoSchema)).toEqual({ undone: false });
  expect(await errorCode(await answer(a.headers, a.id, "interested"), 400)).toBe("bad_request");

  // Interested: sent for one, waiting for the other.
  const sent = await body(await answer(a.headers, b.id, "interested"), deckAnswerSchema);
  expect(sent).toMatchObject({ response: "interested", undoToken: null, matchedName: null });
  const matchId = sent.matchId!;
  expect(
    await body(
      await request.get(`${API}/people/${b.id}`, { headers: a.headers }),
      personPageSchema,
    ),
  ).toMatchObject({ status: "sent", matchId: null });
  expect(
    await body(
      await request.get(`${API}/people/${a.id}`, { headers: b.headers }),
      personPageSchema,
    ),
  ).toMatchObject({ status: "waiting", matchId: null });
  expect(
    (await body(await request.get(`${API}/me`, { headers: b.headers }), meSchema)).waitingCount,
  ).toBe(1);
  const waiting = await body(
    await request.get(`${API}/matches`, { headers: b.headers }),
    matchesSchema,
  );
  expect(waiting.matches).toEqual([
    expect.objectContaining({
      id: matchId,
      section: "waiting",
      otherId: a.id,
      otherName: "Ana A.",
    }),
  ]);

  // Nobody sees the pair page before it is mutual, and outsiders never do.
  const pairUrl = `${API}/matches/${matchId}`;
  expect(await errorCode(await request.get(pairUrl, { headers: a.headers }), 404)).toBe(
    "not_found",
  );
  expect(
    await errorCode(
      await request.post(`${pairUrl}/answer`, {
        headers: outsider.headers,
        data: { response: "interested" },
      }),
      404,
    ),
  ).toBe("not_found");

  const mutual = await body(
    await request.post(`${pairUrl}/answer`, {
      headers: b.headers,
      data: { response: "interested" },
    }),
    matchAnswerSchema,
  );
  expect(mutual).toEqual({ revealed: true });
  expect(await errorCode(await request.get(pairUrl, { headers: outsider.headers }), 404)).toBe(
    "not_found",
  );
  const pair = await body(await request.get(pairUrl, { headers: a.headers }), pairSchema);
  expect(pair).toMatchObject({
    matchId,
    me: { firstName: "Ana" },
    other: { id: b.id, firstName: "Ben", email: b.email, isDemo: false },
    teams: [],
  });
  expect(pair.coffeeChat).toContain("Ben");
  expect(
    await body(
      await request.get(`${API}/people/${b.id}`, { headers: a.headers }),
      personPageSchema,
    ),
  ).toMatchObject({ status: "matched", matchId });

  // Both pick a hackathon, then team up for it; pressing twice makes one team.
  const eventId = pair.events.at(-1)!.id;
  const vote = (headers: Record<string, string>) =>
    request.post(`${pairUrl}/hackathons`, { headers, data: { eventId, on: true } });
  await body(await vote(a.headers), pairSchema);
  const voted = await body(await vote(b.headers), pairSchema);
  expect(voted.events.find((event) => event.id === eventId)).toMatchObject({
    mine: true,
    theirs: true,
  });
  expect(await errorCode(await vote(outsider.headers), 404)).toBe("not_found");

  const teamUp = () => request.post(`${pairUrl}/team`, { headers: a.headers, data: { eventId } });
  const team = await body(await teamUp(), teamUpSchema);
  expect(team.created).toBe(true);
  expect(team.pair.teams).toHaveLength(1);
  expect(team.pair.teams[0]!.members.map((m) => m.id).sort()).toEqual([a.id, b.id].sort());
  expect((await body(await teamUp(), teamUpSchema)).created).toBe(false);

  // Teammates must be mutual matches of the person adding them.
  const addMember = await body(
    await request.post(`${API}/teams/${team.pair.teams[0]!.id}/members`, {
      headers: a.headers,
      data: { email: outsider.email },
    }),
    errorSchema,
    422,
  );
  expect(addMember.error.message).toBe("You can add people you have a mutual match with.");

  const mine = await body(
    await request.get(`${API}/matches`, { headers: a.headers }),
    matchesSchema,
  );
  expect(mine.matches).toEqual([expect.objectContaining({ id: matchId, section: "mutual" })]);
  expect(mine.hackathons.events.find((event) => event.id === eventId)).toMatchObject({
    status: "have-team",
    summary: "Team with Ben",
  });
});

test("a member marks an event as going and changes their profile", async ({ request }) => {
  const me = await member(request, "Dee Api");
  const { events } = await body(
    await request.get(`${API}/events`, { headers: me.headers }),
    eventsSchema,
  );
  const event = events.at(-1)!;
  expect(event.needTeamCount).not.toBeNull();

  const going = (choice: string) =>
    request.put(`${API}/events/${event.slug}/going`, { headers: me.headers, data: { choice } });
  const now = await body(await going("going"), eventSchema);
  expect(now.pool).toMatchObject({ going: true, leftPool: false, matches: [] });
  expect(now.goingCount).toBeGreaterThan(0);
  expect(
    (await body(await request.get(`${API}/me`, { headers: me.headers }), meSchema)).eventIds,
  ).toEqual([event.id]);
  expect((await body(await going("have-team"), eventSchema)).pool).toMatchObject({
    going: true,
    leftPool: true,
  });
  expect((await body(await going("not-going"), eventSchema)).pool?.going).toBe(false);
  expect(await errorCode(await going("maybe"), 400)).toBe("bad_request");

  const patch = (data: unknown) => request.patch(`${API}/me`, { headers: me.headers, data });
  const renamed = await body(
    await patch({ name: { firstName: "Dana", lastName: "Scully" } }),
    meSchema,
  );
  expect(renamed).toMatchObject({ firstName: "Dana", lastName: "Scully", displayName: "Dana S." });
  const tagged = await body(
    await patch({ tags: { areas: ["health", "fintech"], skills: ["react", "pitching"] } }),
    meSchema,
  );
  expect(tagged.areas.map((area) => area.slug)).toEqual(["health", "fintech"]);
  expect(tagged.skills).toEqual([
    { slug: "react", label: "React" },
    { slug: "pitching", label: "Pitching" },
  ]);
  const paused = await body(await patch({ pause: "indefinite" }), meSchema);
  expect(paused.pause?.label).toBe("Paused until you turn matches back on");
  expect((await body(await patch({ pause: "resume" }), meSchema)).pause).toBeNull();
  expect(await errorCode(await patch({ name: { firstName: "" } }), 400)).toBe("bad_request");

  // Deleting needs the confirmation, then the token stops working.
  expect(await errorCode(await request.delete(`${API}/me`, { headers: me.headers }), 400)).toBe(
    "bad_request",
  );
  await body(await request.delete(`${API}/me?confirm=delete`, { headers: me.headers }), okSchema);
  expect(await errorCode(await request.get(`${API}/me`, { headers: me.headers }), 401)).toBe(
    "unauthorized",
  );
  expect(await getUserRow(me.email)).toBeNull();
});

test("a block hides two members from each other, and a report also blocks", async ({ request }) => {
  const [a, b] = await Promise.all([member(request, "Eve Api"), member(request, "Finn Api")]);
  const blockUrl = `${API}/blocks/${b.id}`;

  const blocked = await body(await request.put(blockUrl, { headers: a.headers }), blocksSchema);
  expect(blocked).toEqual({ blocked: [{ id: b.id, displayName: "Finn A." }] });
  // It works both ways, and nobody can see who blocked them.
  for (const [viewer, other] of [
    [a, b],
    [b, a],
  ] as const) {
    expect(
      await errorCode(
        await request.get(`${API}/people/${other.id}`, { headers: viewer.headers }),
        404,
      ),
    ).toBe("not_found");
    const deck = await body(
      await request.get(`${API}/deck`, { headers: viewer.headers }),
      deckSchema,
    );
    expect(deck.cards.some((card) => card.id === other.id)).toBe(false);
    expect(
      await errorCode(
        await request.post(`${API}/deck/answer`, {
          headers: viewer.headers,
          data: { userId: other.id, response: "interested" },
        }),
        409,
      ),
    ).toBe("unavailable");
  }
  expect(
    await body(await request.get(`${API}/blocks`, { headers: b.headers }), blocksSchema),
  ).toEqual({
    blocked: [],
  });

  // Unblocking brings them back; you can't block yourself or nobody.
  expect(await body(await request.delete(blockUrl, { headers: a.headers }), blocksSchema)).toEqual({
    blocked: [],
  });
  await body(await request.get(`${API}/people/${b.id}`, { headers: a.headers }), personPageSchema);
  for (const id of [a.id, crypto.randomUUID()]) {
    expect(
      await errorCode(await request.put(`${API}/blocks/${id}`, { headers: a.headers }), 404),
    ).toBe("not_found");
  }
  expect(await errorCode(await request.put(blockUrl), 401)).toBe("unauthorized");

  // A report needs a known reason, records it, and blocks.
  const report = (data: unknown) => request.post(`${API}/reports`, { headers: a.headers, data });
  expect(await errorCode(await report({ userId: b.id, reason: "boring" }), 400)).toBe(
    "bad_request",
  );
  expect(await errorCode(await report({ userId: a.id, reason: "spam" }), 404)).toBe("not_found");
  await body(await report({ userId: b.id, reason: "spam", note: "Selling a course." }), okSchema);
  expect(
    await query(`select reason, note, status from public.reports where reporter_id = $1`, [a.id]),
  ).toEqual([{ reason: "spam", note: "Selling a course.", status: "open" }]);
  expect(
    await body(await request.get(`${API}/blocks`, { headers: a.headers }), blocksSchema),
  ).toEqual({
    blocked: [{ id: b.id, displayName: "Finn A." }],
  });
});
