import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signIn, signInOnboarded } from "./auth";
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

const SEEDED_PITCH = "Let nurses swap shifts in minutes instead of days.";

test("the logged-out landing page shows the slogan and upcoming hackathons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Match for your next Hackathon here",
  );
  await expect(page.getByRole("region", { name: "Upcoming in NYC" })).toBeVisible();
  // Nothing below the hackathons: no sample cards on the landing page.
  await expect(page.getByRole("article")).toHaveCount(0);
});

test("the logged-out board shows seeded ideas and never emails or full idea text", async ({
  page,
}) => {
  const response = await page.goto("/?view=list");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find someone to build with");
  await expect(page.getByRole("article", { name: SEEDED_PITCH })).toBeVisible();
  // Featured ideas come first.
  await expect(page.getByRole("article").first()).toContainText("Featured");

  const html = await response!.text();
  expect(html).not.toMatch(/[a-z0-9.+-]+@cornell\.edu/i);
  // A seeded idea's full text (raw_text), which only its owner may see.
  expect(html).not.toContain("Hospitals approve rules once");

  await page.getByRole("link", { name: "Builders" }).click();
  await expect(page).toHaveURL("/?tab=people&view=list");
  await expect(page.getByRole("article", { name: "Sofia C." })).toBeVisible();
  // Paused users are not on the board.
  await expect(page.getByRole("article", { name: "Lena H." })).toHaveCount(0);
});

test("filters change the results and the URL can be shared", async ({ page }) => {
  await page.goto("/?view=list");
  await page.getByText("Filter", { exact: true }).click();
  await page.getByLabel("Skill", { exact: true }).selectOption("ml");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL("/?skill=ml&view=list");
  await expect(
    page.getByRole("article", { name: "Turn lecture recordings into flashcards automatically." }),
  ).toBeVisible();
  await expect(page.getByRole("article", { name: SEEDED_PITCH })).toHaveCount(0);

  // The same URL in a fresh page shows the same filtered board.
  const shared = await page.context().newPage();
  await shared.goto("/?tab=people&skill=react");
  await expect(shared.getByRole("article", { name: "Sofia C." })).toBeVisible();
  await expect(shared.getByRole("article", { name: "Ravi Y." })).toHaveCount(0);
  await expect(shared.getByLabel("Skill", { exact: true })).toHaveValue("react");
});

test("visitors see 3 cards for an event; members can load more", async ({ page }) => {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, 'E2E Hack', current_date + 5, current_date + 6) returning id`,
    [slug],
  );
  const email = newEmail();
  const owner = await createUser(email, { role: "idea" });
  await query(
    `insert into public.ideas (owner_id, event_id, raw_text, pitch)
     select $1, $2, 'Idea number ' || n, 'E2E idea ' || lpad(n::text, 2, '0')
     from generate_series(1, 21) as n`,
    [owner, event!.id],
  );

  // Visitors see 3 cards for an event, then a prompt to sign in.
  await page.goto(`/?event=${slug}`);
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("See all ideas for this event")).toBeVisible();
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);

  await signInOnboarded(page, newEmail());
  await page.goto(`/?event=${slug}&view=list`);
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(page).toHaveURL(`/?event=${slug}&n=40&view=list`);
  await expect(page.getByRole("article")).toHaveCount(21);
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
});

test("logged-out calls to action record the click and lead to sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Join with your Cornell email" }).click();
  await expect(page).toHaveURL("/login?next=%2Fonboarding");

  await page.goto("/?view=list");
  const card = page.getByRole("article", { name: SEEDED_PITCH });
  await card.getByRole("link", { name: "Interested" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fideas%2F[0-9a-f-]{36}$/);

  const [row] = await query<{ hero: number; card: number }>(
    `select count(*) filter (where props->>'from' = 'hero')::int as hero,
            count(*) filter (where props->>'from' = 'card')::int as card
     from public.analytics_events where name = 'cta_clicked' and created_at > now() - interval '1 minute'`,
  );
  expect(row!.hero).toBeGreaterThanOrEqual(1);
  expect(row!.card).toBeGreaterThanOrEqual(1);
});

test("a signed-in member does not see their own card", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole("button", { name: "I have an idea" }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("Your idea in one sentence")
    .fill("A campus app that matches study partners for late-night problem sets");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");

  const [idea] = await query<{ pitch: string }>(
    `select i.pitch from public.ideas i join public.users u on u.id = i.owner_id
     where u.cornell_email = $1`,
    [email],
  );
  await page.goto("/?view=list");
  await expect(page.getByRole("link", { name: "Post an idea" })).toBeVisible();
  await expect(page.getByRole("article", { name: SEEDED_PITCH })).toBeVisible();
  await expect(page.getByRole("article", { name: idea!.pitch })).toHaveCount(0);
});

test("the board works without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/?view=list");
    await page.getByText("Filter", { exact: true }).click();
    await page.getByLabel("Area", { exact: true }).selectOption("climate");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL("/?domain=climate&view=list");
    await expect(
      page.getByRole("article", { name: "A live air-quality map from cheap campus sensors." }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a builder's card page shows their public profile only", async ({ page }) => {
  const response = await page.goto("/people/00000000-0000-4000-a000-000000000201");
  await expect(page.getByRole("article", { name: "Sofia C." })).toBeVisible();
  expect(await response!.text()).not.toContain("seed-201@cornell.edu");

  const paused = await page.goto("/people/00000000-0000-4000-a000-000000000302");
  expect(paused!.status()).toBe(404);
});

test("the board has no horizontal scroll", async ({ page }) => {
  await page.goto("/?tab=people");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
