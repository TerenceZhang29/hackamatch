import { expect, test } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { deleteUser, query, uniqueEmail } from "./helpers";

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

test("the event page shows its details and how many are going (P1-24)", async ({ page }) => {
  const response = await page.goto(`/e/${SLUG}`);
  await expect(page.getByRole("heading", { name: "Cornell Tech Fall Hack" })).toBeVisible();
  // Area tags, when, where, host and the description.
  await expect(page.getByRole("list", { name: "Areas" }).getByRole("listitem")).toHaveText([
    "AI tools",
    "Social good",
    "Campus life",
  ]);
  await expect(page.getByText("10:00 AM – 10:00 AM next day")).toBeVisible();
  await expect(page.getByText("Cornell Tech, Roosevelt Island")).toBeVisible();
  await expect(page.getByText("Hosted by Cornell Tech")).toBeVisible();
  await expect(page.getByText("A 24-hour hackathon on Roosevelt Island.")).toBeVisible();
  await expect(page.getByText(/^\d+ people going$/)).toBeVisible();
  // No idea or people lists on the page any more; the cards live in Discover.
  await expect(page.getByRole("article", { name: /Let nurses swap shifts/ })).toHaveCount(0);
  expect(await response!.text()).not.toMatch(/@cornell\.edu/);
});

test("a visitor's 'Discover who's going' starts sign-up with the event ticked", async ({
  page,
}) => {
  await page.goto(`/e/${SLUG}`);
  await page.getByRole("link", { name: "Discover who's going" }).click();
  await expect(page).toHaveURL(`/signup?event=${SLUG}`);
  await expect(page.getByRole("button", { name: /Cornell Tech Fall Hack/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a new user arriving from a join link finishes sign-up with the event selected", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email, `/login?next=${encodeURIComponent(`/e/${SLUG}?join=1`)}`);
  await expect(page).toHaveURL(`/onboarding?next=${encodeURIComponent(`/e/${SLUG}?join=1`)}`);
  await expect(page.getByRole("button", { name: /Cornell Tech Fall Hack/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Backend", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill("Joiner");
  await page.getByRole("button", { name: "Join HackaMatch" }).click();
  await expect(page).toHaveURL("/");
  expect(await interestCount(email)).toBe(1);
});

test("a member says I'm going!, sees the status, and can change their mind", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page);

  await page.goto(`/e/${SLUG}`);
  await page.getByRole("button", { name: "I'm going!" }).click();
  await expect(page.getByRole("status")).toContainText("You're going!");
  await expect(page.getByText(/people going, including you/)).toBeVisible();
  expect(await interestCount(email)).toBe(1);

  await page.getByRole("button", { name: "Not going?" }).click();
  await expect(page.getByRole("button", { name: "I'm going!" })).toBeVisible();
  expect(await interestCount(email)).toBe(0);

  // A join link tags the event for a signed-in member and lands on the clean URL.
  await page.goto(`/e/${SLUG}?join=1`);
  await expect(page).toHaveURL(`/e/${SLUG}`);
  expect(await interestCount(email)).toBe(1);
});

test("past events say so, and unknown events are a 404", async ({ page }) => {
  await page.goto("/e/spring-startup-sprint");
  await expect(page.getByText("This event has ended.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Discover who's going" })).toHaveCount(0);

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
  // Its dates (the seed dates move with today).
  await expect(fallHack).toContainText(/[A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+/);
  await expect(page.getByRole("link", { name: /Health AI Buildathon/ })).toBeVisible();
  await expect(page.getByText("Spring Startup Sprint")).toHaveCount(0);
  await expect(page.getByText("You're going")).toHaveCount(0);

  await fallHack.click();
  await expect(page).toHaveURL(`/e/${SLUG}`);
  await page.getByRole("link", { name: "Events" }).last().click();
  await expect(page).toHaveURL("/events");
});

test("/events puts a member's hackathons first, then the rest", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page);

  await page.goto("/e/health-ai-buildathon");
  await page.getByRole("button", { name: "I'm going!" }).click();
  await expect(page.getByRole("status")).toContainText("You're going!");

  await page.goto("/events");
  const going = page.getByRole("region", { name: "You're going" });
  const more = page.getByRole("region", { name: "More hackathons" });
  await expect(going.getByRole("link", { name: /Health AI Buildathon/ })).toContainText(
    "You're going",
  );
  await expect(more.getByRole("link", { name: /Cornell Tech Fall Hack/ })).not.toContainText(
    "You're going",
  );
});
