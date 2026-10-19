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

/** A private upcoming event and a signed-in member who is going to it. */
async function memberGoing(page: Page) {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, $2, current_date + 5, current_date + 6) returning id`,
    [slug, `Pool Hack ${slug}`],
  );
  const email = newEmail();
  await signInOnboarded(page, email);
  const [viewer] = await query<{ id: string }>(
    `select id from public.users where cornell_email = $1`,
    [email],
  );
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    viewer!.id,
    event!.id,
  ]);
  return { slug, name: `Pool Hack ${slug}`, eventId: event!.id, viewerId: viewer!.id };
}

/** A new person going to the event with a revealed match with the viewer; they picked the event. */
async function matchFor(viewerId: string, eventId: string, name: string) {
  const other = await createUser(newEmail(), { name, role: "idea" });
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    other,
    eventId,
  ]);
  const matchId = await createMatch(viewerId, other, { interested: [viewerId, other] });
  await query(`update public.matches set revealed_at = now() where id = $1`, [matchId]);
  await query(
    `insert into public.match_event_votes (match_id, user_id, event_id) values ($1, $2, $3)`,
    [matchId, other, eventId],
  );
  return matchId;
}

const voteForEvent = (matchId: string, userId: string, eventId: string) =>
  query(`insert into public.match_event_votes (match_id, user_id, event_id) values ($1, $2, $3)`, [
    matchId,
    userId,
    eventId,
  ]);

test("a match for an event asks once whether to keep matching; leaving and rejoining", async ({
  page,
  browser,
}) => {
  const { slug, name, eventId, viewerId } = await memberGoing(page);
  const matchId = await matchFor(viewerId, eventId, "Maya Pool");
  const prompt = page.getByRole("group", { name: `Keep matching for ${name}?` });

  // Picking the event on the pair page makes it a match for the event, and asks.
  await page.goto(`/matches/${matchId}`);
  await page.getByRole("listitem", { name }).getByRole("button", { name: "I'd do this" }).click();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Keep looking" }).click();
  await expect(page).toHaveURL(`/matches/${matchId}`);
  await expect(prompt).toHaveCount(0);

  // The event page shows the match, and doesn't ask again.
  await page.goto(`/e/${slug}`);
  await expect(page.getByText("You've matched with 1 person for this event: Maya.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Maya" })).toHaveAttribute(
    "href",
    `/matches/${matchId}`,
  );
  await expect(prompt).toHaveCount(0);

  // A visitor sees both people going; after "I have my team", only Maya.
  const visitor = await browser.newContext();
  const visitorPage = await visitor.newPage();
  const going = visitorPage.getByRole("region", { name: "People going" });
  try {
    await visitorPage.goto(`/e/${slug}`);
    await expect(going.getByRole("article")).toHaveCount(2);

    await page.getByRole("button", { name: "I have my team" }).click();
    await expect(
      page.getByText("You're going and have your team. You're hidden from this event's list."),
    ).toBeVisible();
    await visitorPage.reload();
    await expect(going.getByRole("article")).toHaveCount(1);
    await expect(going.getByRole("article", { name: "Maya P." })).toBeVisible();
    await expect(visitorPage.getByText("1 person is looking for teammates")).toBeVisible();

    await page.getByRole("button", { name: "I'm looking again" }).click();
    await expect(page.getByText("You're in for this event.")).toBeVisible();
    await visitorPage.reload();
    await expect(going.getByRole("article")).toHaveCount(2);
  } finally {
    await visitor.close();
  }

  // A second match asks again; this time the viewer's team is set.
  const second = await matchFor(viewerId, eventId, "Omar Pool");
  await voteForEvent(second, viewerId, eventId);
  await page.goto(`/e/${slug}`);
  await expect(
    page.getByText(/You've matched with 2 people for this event: Maya, Omar\./),
  ).toBeVisible();
  await prompt.getByRole("button", { name: "I have my team" }).click();
  await expect(page.getByText("You're going and have your team.", { exact: false })).toBeVisible();
  await expect(prompt).toHaveCount(0);
  const [row] = await query<{ left: boolean; prompted: number }>(
    `select left_pool_at is not null as left, prompted_matches as prompted
     from public.event_interests where user_id = $1 and event_id = $2`,
    [viewerId, eventId],
  );
  expect(row).toEqual({ left: true, prompted: 2 });
});

test("'I'm no longer going' with a match asks first, and keeps the match", async ({ page }) => {
  const { slug, eventId, viewerId } = await memberGoing(page);
  const matchId = await matchFor(viewerId, eventId, "Maya Pool");
  await voteForEvent(matchId, viewerId, eventId);
  const confirm = page.getByRole("group", { name: "Not going?" });

  await page.goto(`/e/${slug}`);
  await expect(page.getByRole("button", { name: "I'm not going after all" })).toHaveCount(0);
  await page.getByRole("link", { name: "I'm no longer going" }).click();
  await expect(confirm).toContainText(
    "You've matched with Maya for this event. Let them know you're not going.",
  );
  await confirm.getByRole("link", { name: "Cancel" }).click();
  await expect(page).toHaveURL(`/e/${slug}`);
  await expect(confirm).toHaveCount(0);

  await page.getByRole("link", { name: "I'm no longer going" }).click();
  await confirm.getByRole("button", { name: "Yes, I'm not going" }).click();
  await expect(page.getByRole("button", { name: "I'm interested in this event" })).toBeVisible();
  const interests = await query(
    `select 1 from public.event_interests where user_id = $1 and event_id = $2`,
    [viewerId, eventId],
  );
  expect(interests).toHaveLength(0);

  // The match and its pair page are untouched.
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("heading", { name: "You and Maya" })).toBeVisible();
});
