import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signInOnboarded } from "./auth";
import { createMatch, createUser, deleteUser, query, uniqueEmail } from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};
const createdEvents: string[] = [];

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
  for (const slug of createdEvents.splice(0)) {
    await query(`delete from public.events where slug = $1`, [slug]);
  }
});

const PAST_EVENT = "00000000-0000-4000-b000-000000000003";

async function newEvent(days = 5) {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const name = `Hack ${slug}`;
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, $2, current_date + $3::int, current_date + $3::int + 1) returning id`,
    [slug, name, days],
  );
  return { id: event!.id, slug, name };
}

async function signInMember(page: Page) {
  const email = newEmail();
  await signInOnboarded(page, email);
  const [viewer] = await query<{ id: string }>(
    `select id from public.users where cornell_email = $1`,
    [email],
  );
  return viewer!.id;
}

const tag = (userId: string, eventId: string) =>
  query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    userId,
    eventId,
  ]);

/** A revealed match with a new person; `pickedBy` lists who picked `eventId` on the pair page. */
async function revealedMatch(
  viewerId: string,
  name: string,
  eventId?: string,
  pickedBy?: string[],
) {
  const other = await createUser(newEmail(), { name, role: "builder" });
  const matchId = await createMatch(viewerId, other, { interested: [viewerId, other] });
  await query(`update public.matches set revealed_at = now() where id = $1`, [matchId]);
  for (const who of pickedBy ?? []) {
    await query(
      `insert into public.match_event_votes (match_id, user_id, event_id) values ($1, $2, $3)`,
      [matchId, who === "viewer" ? viewerId : other, eventId],
    );
  }
  return { other, matchId };
}

async function team(matchId: string, eventId: string | null, members: string[]) {
  const [row] = await query<{ id: string }>(
    `insert into public.teams (event_id, match_id, created_by) values ($1, $2, $3) returning id`,
    [eventId, matchId, members[0]],
  );
  for (const member of members) {
    await query(`insert into public.team_members (team_id, user_id) values ($1, $2)`, [
      row!.id,
      member,
    ]);
  }
}

test("one line per event: team, other matches, the prompt and leaving the pool", async ({
  page,
}) => {
  const viewer = await signInMember(page);
  const busy = await newEvent(5);
  const quiet = await newEvent(9);
  await tag(viewer, busy.id);
  await tag(viewer, quiet.id);
  const sofia = await revealedMatch(viewer, "Sofia Team", busy.id, ["viewer", "other"]);
  await team(sofia.matchId, busy.id, [viewer, sofia.other]);
  await revealedMatch(viewer, "Lee Match", busy.id, ["viewer", "other"]);

  await page.goto("/matches");
  const section = page.getByRole("region", { name: "Your hackathons" });
  const busyLine = section.getByRole("group", { name: busy.name, exact: true });
  const quietLine = section.getByRole("group", { name: quiet.name, exact: true });
  await expect(section.getByRole("listitem")).toHaveCount(2);
  await expect(section.getByRole("listitem").first()).toContainText(busy.name);

  // New matches for the event: the line opens with the prompt.
  await expect(busyLine).toContainText("Team with Sofia · 1 more match");
  await expect(busyLine).toContainText("Looking for a team");
  await expect(busyLine).toHaveAttribute("open", "");
  await expect(busyLine.getByRole("link", { name: "Sofia" })).toHaveAttribute(
    "href",
    `/matches/${sofia.matchId}`,
  );
  await expect(busyLine).toContainText("Also matched for this event: Lee");
  const prompt = busyLine.getByRole("group", { name: `Keep matching for ${busy.name}?` });
  await prompt.getByRole("button", { name: "Keep looking" }).click();
  await expect(page).toHaveURL("/matches");
  await expect(busyLine).not.toHaveAttribute("open");
  await expect(prompt).toHaveCount(0);

  await busyLine.locator("summary").click();
  await busyLine.getByRole("button", { name: "I have my team" }).click();
  await expect(busyLine).toContainText("Have my team");
  await busyLine.locator("summary").click();
  await expect(busyLine.getByRole("button", { name: "I'm looking again" })).toBeVisible();

  await expect(quietLine).toContainText("No matches yet");
  await quietLine.locator("summary").click();
  await expect(quietLine.getByRole("link", { name: "See who's going →" })).toHaveAttribute(
    "href",
    `/e/${quiet.slug}`,
  );
});

test("a match for an event you never tagged: 'I'm going', and teaming up tags it", async ({
  page,
  browser,
}) => {
  const viewer = await signInMember(page);
  const picked = await newEvent(5);
  const teamed = await newEvent(7);
  const maya = await revealedMatch(viewer, "Maya Untagged", picked.id, ["viewer", "other"]);
  await query(
    `insert into public.match_event_votes (match_id, user_id, event_id) values ($1, $2, $4), ($1, $3, $4)`,
    [maya.matchId, viewer, maya.other, teamed.id],
  );

  await page.goto("/matches");
  const section = page.getByRole("region", { name: "Your hackathons" });
  const pickedLine = section.getByRole("group", { name: picked.name, exact: true });
  await expect(pickedLine).toContainText("Matched with Maya, no team yet · Not marked as going");
  await pickedLine.locator("summary").click();
  await pickedLine.getByRole("button", { name: "I'm going" }).click();
  await expect(page).toHaveURL("/matches");
  await expect(pickedLine).toContainText("Looking for a team");
  // Now in the pool with a match there, so the line asks.
  await expect(pickedLine).toHaveAttribute("open", "");

  // "We teamed up" for an event neither tagged: both go, out of the pool.
  await page.goto(`/matches/${maya.matchId}`);
  await page
    .getByLabel("For which event?")
    .selectOption({ label: `${teamed.name} (you both picked it)` });
  await page.getByRole("button", { name: "We teamed up" }).click();
  await expect(page.getByText("Team saved. Good luck!")).toBeVisible();
  const rows = await query<{ user_id: string; left: boolean }>(
    `select user_id, left_pool_at is not null as left from public.event_interests where event_id = $1`,
    [teamed.id],
  );
  expect(rows.map((r) => r.left)).toEqual([true, true]);
  expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([viewer, maya.other]));

  await page.goto("/matches");
  await expect(section.getByRole("group", { name: teamed.name, exact: true })).toContainText(
    "Team with Maya · Have my team",
  );
  const visitor = await browser.newContext();
  try {
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(`/e/${teamed.slug}`);
    await expect(visitorPage.getByText("No one has tagged this event yet.")).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test("teaming up leaves someone who chose to look in the pool", async ({ page }) => {
  const viewer = await signInMember(page);
  const event = await newEvent(5);
  await tag(viewer, event.id);
  const omar = await revealedMatch(viewer, "Omar Looking", event.id, ["viewer", "other"]);

  await page.goto(`/matches/${omar.matchId}`);
  await page
    .getByLabel("For which event?")
    .selectOption({ label: `${event.name} (you both picked it)` });
  await page.getByRole("button", { name: "We teamed up" }).click();
  await expect(page.getByText("Team saved. Good luck!")).toBeVisible();
  const rows = await query<{ user_id: string; left: boolean }>(
    `select user_id, left_pool_at is not null as left from public.event_interests where event_id = $1`,
    [event.id],
  );
  const byUser = new Map(rows.map((r) => [r.user_id, r.left]));
  expect(byUser.get(viewer)).toBe(false);
  expect(byUser.get(omar.other)).toBe(true);
});

test("side projects get their own card; past events and empty states", async ({ page }) => {
  const viewer = await signInMember(page);
  await page.goto("/matches");
  const section = page.getByRole("region", { name: "Your hackathons" });
  await expect(section).toContainText("You're not going to any hackathons yet.");
  await expect(section.getByRole("link", { name: "Browse upcoming hackathons →" })).toHaveAttribute(
    "href",
    "/events",
  );

  const ava = await revealedMatch(viewer, "Ava Side");
  await team(ava.matchId, null, [viewer, ava.other]);
  const bo = await revealedMatch(viewer, "Bo Past");
  await team(bo.matchId, PAST_EVENT, [viewer, bo.other]);
  await page.reload();
  await expect(section.getByText("Side projects")).toBeVisible();
  await expect(section.getByRole("link", { name: "Ava" })).toHaveAttribute(
    "href",
    `/matches/${ava.matchId}`,
  );
  await expect(section).not.toContainText("Bo");
  await expect(section).not.toContainText("Spring Startup Sprint");
});
