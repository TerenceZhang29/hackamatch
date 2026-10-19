import { expect, test } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { deleteUser, query, uniqueEmail } from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

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
  await expect(page.getByText(/\d+ people are looking for teammates for this event/)).toBeVisible();
  await expect(page.getByText(/Teams of 2–4/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Ideas for this event" }).getByRole("article", {
      name: "Let nurses swap shifts in minutes instead of days.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Builders going" }).getByRole("article", { name: "Sofia C." }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox").first().fill("I build React apps for health");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: /Cornell Tech Fall Hack/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Join the pool" }).click();

  await expect(page).toHaveURL(`/e/${SLUG}`);
  await expect(page.getByText("You're in for this event.")).toBeVisible();
  expect(await interestCount(email)).toBe(1);
});

test("a member can say they're in, and change their mind", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role: "I can build", sentence: "I build Go backends" });
  await expect(page).toHaveURL("/matches?welcome=1");

  await page.goto(`/e/${SLUG}`);
  await page.getByRole("button", { name: "I'm interested in this event" }).click();
  await expect(page.getByText("You're in for this event.")).toBeVisible();
  expect(await interestCount(email)).toBe(1);

  await page.getByRole("button", { name: "I'm not going after all" }).click();
  await expect(page.getByRole("button", { name: "I'm interested in this event" })).toBeVisible();
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
  await expect(fallHack).toContainText(/\d+ (person|people) looking for a team/);
  await expect(fallHack).toContainText("Teams of 2–4");
  await expect(page.getByRole("link", { name: /Health AI Buildathon/ })).toBeVisible();
  await expect(page.getByText("Spring Startup Sprint")).toHaveCount(0);
  await expect(page.getByText("You're going")).toHaveCount(0);

  await fallHack.click();
  await expect(page).toHaveURL(`/e/${SLUG}`);
  await page.getByRole("link", { name: "← All events" }).click();
  await expect(page).toHaveURL("/events");
});

test("/events marks the events a member is going to", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role: "I can build", sentence: "I build Go backends" });
  await expect(page).toHaveURL("/matches?welcome=1");

  // Not the Fall Hack: a new builder there could push seeded cards off its page in parallel tests.
  await page.goto("/e/health-ai-buildathon");
  await page.getByRole("button", { name: "I'm interested in this event" }).click();
  await expect(page.getByText("You're in for this event.")).toBeVisible();

  await page.goto("/events");
  await expect(page.getByRole("link", { name: /Health AI Buildathon/ })).toContainText(
    "You're going",
  );
  await expect(page.getByRole("link", { name: /Cornell Tech Fall Hack/ })).not.toContainText(
    "You're going",
  );
});
