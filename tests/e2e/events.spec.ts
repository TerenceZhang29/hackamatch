import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { onboard, signIn, signInOnboarded } from "./auth";
import { createUser, deleteUser, query, uniqueEmail } from "./helpers";

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

/** A private upcoming event with `people` members going (alternating idea / builder) and `ideas` ideas. */
async function eventWithPeople(people: number, ideas: number) {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, 'E2E Hack', current_date + 5, current_date + 6) returning id`,
    [slug],
  );
  const ids: string[] = [];
  for (let n = 0; n < people; n++) {
    const id = await createUser(newEmail(), {
      name: `Person${n} Test`,
      role: n % 2 ? "builder" : "idea",
    });
    ids.push(id);
    await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
      id,
      event!.id,
    ]);
  }
  await query(
    `insert into public.ideas (owner_id, event_id, raw_text, pitch)
     select $1, $2, 'Idea number ' || n, 'E2E idea ' || n from generate_series(1, $3::int) as n`,
    [ids[0], event!.id, ideas],
  );
  return slug;
}

const SLUG = "cornell-tech-fall-hack";
const interestCount = async (email: string) =>
  (
    await query<{ n: number }>(
      `select count(*)::int as n from public.event_interests ei
       join public.events e on e.id = ei.event_id join public.users u on u.id = ei.user_id
       where e.slug = $1 and u.cornell_email = $2`,
      [SLUG, email],
    )
  )[0]!.n;

test("the public event page shows the event, who is looking, and its ideas", async ({ page }) => {
  const response = await page.goto(`/e/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Cornell Tech Fall Hack" })).toBeVisible();
  await expect(page.getByText(/^\d+ looking$/)).toBeVisible();
  await expect(page.getByText(/Teams of 2–4/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ideas for this event" }).getByRole("article", {
      name: "Let nurses swap shifts in minutes instead of days.",
    }),
  ).toBeVisible();
  // Visitors see 3 people and a prompt to sign in for the rest.
  const going = page.getByRole("region", { name: "People going" });
  await expect(going.getByRole("article")).toHaveCount(3);
  await expect(going).toContainText(/See all \d+ people going/);
  expect(await response!.text()).not.toMatch(/@cornell\.edu/);
});

test("a new user arriving from the event link finishes onboarding with the event selected", async ({
  page,
}) => {
  const email = newEmail();
  await page.goto(`/e/${SLUG}`);
  await page.getByRole("link", { name: "Find a team for this event" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/e/${SLUG}?join=1`)}`);

  await signIn(page, email, page.url().replace(/^https?:\/\/[^/]+/, ""));
  await expect(page).toHaveURL(`/onboarding?next=${encodeURIComponent(`/e/${SLUG}?join=1`)}`);
  await page.getByRole("button", { name: "I want to find an idea to build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox").first().fill("I build React apps for health");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: /Cornell Tech Fall Hack/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Join the pool" }).click();

  await expect(page).toHaveURL(`/e/${SLUG}`);
  await expect(page.getByText("Looking", { exact: true })).toBeVisible();
  expect(await interestCount(email)).toBe(1);
});

test("a member can say they're in, and change their mind", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role: "I want to find an idea to build", sentence: "I build Go backends" });
  await expect(page).toHaveURL("/matches?welcome=1");

  await page.goto(`/e/${SLUG}`);
  await page.getByRole("button", { name: "I'm going" }).click();
  await expect(page.getByText("Looking", { exact: true })).toBeVisible();
  expect(await interestCount(email)).toBe(1);

  await page.getByRole("button", { name: "I'm not going after all" }).click();
  await expect(page.getByRole("button", { name: "I'm going" })).toBeVisible();
  expect(await interestCount(email)).toBe(0);

  // A join link tags the event for a signed-in member and lands on the clean URL.
  await page.goto(`/e/${SLUG}?join=1`);
  await expect(page).toHaveURL(`/e/${SLUG}`);
  expect(await interestCount(email)).toBe(1);
});

test("past events say so, and unknown events are a 404", async ({ page }) => {
  await page.goto("/e/spring-startup-sprint");
  await expect(page.getByText("This event has ended.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find a team for this event" })).toHaveCount(0);

  const missing = await page.goto("/e/no-such-event");
  expect(missing!.status()).toBe(404);
});

test("the event page has no horizontal scroll", async ({ page }) => {
  await page.goto(`/e/${SLUG}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("/events lists upcoming hackathons only, and links to each event page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page).toHaveURL("/events");
  await expect(page.getByRole("heading", { name: "Upcoming hackathons" })).toBeVisible();

  const fallHack = page.getByRole("link", { name: /Cornell Tech Fall Hack/ });
  await expect(fallHack).toContainText(/\d+ looking/);
  await expect(fallHack).toContainText("Teams of 2–4");
  await expect(page.getByRole("link", { name: /Health AI Buildathon/ })).toBeVisible();
  await expect(page.getByText("Spring Startup Sprint")).toHaveCount(0);
  await expect(page.getByText("You're going")).toHaveCount(0);

  await fallHack.click();
  await expect(page).toHaveURL(`/e/${SLUG}`);
  await page.getByRole("link", { name: "All events" }).click();
  await expect(page).toHaveURL("/events");
});

test("/events marks the events a member is going to", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role: "I want to find an idea to build", sentence: "I build Go backends" });
  await expect(page).toHaveURL("/matches?welcome=1");

  // Not the Fall Hack: a new builder there could push seeded cards off its page in parallel tests.
  await page.goto("/e/health-ai-buildathon");
  await page.getByRole("button", { name: "I'm going" }).click();
  await expect(page.getByText("Looking", { exact: true })).toBeVisible();

  await page.goto("/events");
  await expect(page.getByRole("link", { name: /Health AI Buildathon/ })).toContainText(
    "You're going",
  );
  await expect(page.getByRole("link", { name: /Cornell Tech Fall Hack/ })).not.toContainText(
    "You're going",
  );
});

test("visitors see 3 people and 3 ideas per event; members see everyone, every role", async ({
  page,
}) => {
  const slug = await eventWithPeople(14, 4);
  await page.goto(`/e/${slug}`);
  const going = page.getByRole("region", { name: "People going" });
  const ideas = page.getByRole("region", { name: "Ideas for this event" });
  await expect(going.getByRole("article")).toHaveCount(3);
  await expect(going).toContainText("See all 14 people going");
  // Visitors don't see where people are going beyond these 3 cards.
  await expect(going.getByRole("list", { name: "Looking for teammates at" })).toHaveCount(0);
  await expect(ideas.getByRole("article")).toHaveCount(3);
  await expect(ideas).toContainText("See all ideas for this event");
  await expect(page.getByRole("link", { name: /Show more/ })).toHaveCount(0);

  await going.getByRole("link", { name: "Sign in with your Cornell email" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/e/${slug}`)}`);

  await signInOnboarded(page, newEmail());
  await page.goto(`/e/${slug}`);
  await expect(going.getByRole("article")).toHaveCount(12);
  // Both roles are listed: Ideas tags (idea people) and Builds tags (builders).
  await expect(going.getByRole("list", { name: "Role" }).getByText("Ideas").first()).toBeVisible();
  await expect(going.getByRole("list", { name: "Role" }).getByText("Builds").first()).toBeVisible();
  await expect(ideas.getByRole("article")).toHaveCount(4);
  await expect(going.getByRole("list", { name: "Looking for teammates at" }).first()).toContainText(
    "E2E Hack",
  );
  await expect(page.getByText(/Sign in with your Cornell email|See all/)).toHaveCount(0);

  await page.getByRole("link", { name: "Show more people" }).click();
  await expect(page).toHaveURL(`/e/${slug}?people=24`);
  await expect(going.getByRole("article")).toHaveCount(14);
  await expect(page.getByRole("link", { name: "Show more people" })).toHaveCount(0);
});
