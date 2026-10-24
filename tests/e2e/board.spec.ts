import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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

test("the logged-out board lists people and never shows emails", async ({ page }) => {
  const response = await page.goto("/?view=list");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Find someone to build with");
  await expect(page.getByRole("article", { name: "Sofia C." })).toBeVisible();
  // Everyone is a person card now (P1-24): no tabs, no idea cards.
  await expect(page.getByRole("navigation", { name: "Board tabs" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Maya P." })).toBeVisible();
  // Paused users are not on the board.
  await expect(page.getByRole("article", { name: "Lena H." })).toHaveCount(0);

  const html = await response!.text();
  expect(html).not.toMatch(/[a-z0-9.+-]+@cornell\.edu/i);
});

test("filters change the results and the URL can be shared", async ({ page }) => {
  await page.goto("/?view=list");
  await page.getByText("Filter", { exact: true }).click();
  await page.getByLabel("Skill", { exact: true }).selectOption("react");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL("/?skill=react&view=list");
  await expect(page.getByRole("article", { name: "Sofia C." })).toBeVisible();
  await expect(page.getByRole("article", { name: "Ravi Y." })).toHaveCount(0);

  // The same URL in a fresh page shows the same filtered board.
  const shared = await page.context().newPage();
  await shared.goto("/?skill=react");
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
  for (let n = 0; n < 21; n++) {
    const id = await createUser(newEmail(), { name: `Going ${n}` });
    await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
      id,
      event!.id,
    ]);
  }

  // Visitors see 3 cards for an event, then a prompt to sign in.
  await page.goto(`/?event=${slug}`);
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByText("See all people going to this event")).toBeVisible();
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);

  await signInOnboarded(page, newEmail());
  await page.goto(`/?event=${slug}&view=list`);
  await expect(page.getByRole("article")).toHaveCount(20);
  await page.getByRole("link", { name: "Load more" }).click();
  await expect(page).toHaveURL(`/?event=${slug}&n=40&view=list`);
  await expect(page.getByRole("article")).toHaveCount(21);
  await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
});

test("logged-out calls to action lead to sign-up and sign-in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Match Now" }).click();
  await expect(page).toHaveURL("/signup");

  // Narrowed to Sofia, so people left by other tests don't push her off the page.
  await page.goto("/?skill=nextjs");
  const card = page.getByRole("article", { name: "Sofia C." });
  await card.getByRole("link", { name: "Interested" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpeople%2F[0-9a-f-]{36}$/);

  const [row] = await query<{ card: number }>(
    `select count(*) filter (where props->>'from' = 'card')::int as card
     from public.analytics_events where name = 'cta_clicked' and created_at > now() - interval '1 minute'`,
  );
  expect(row!.card).toBeGreaterThanOrEqual(1);
});

test("a signed-in member does not see their own card", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { firstName: "Selfie", skill: "Frontend" });
  await page.goto("/?skill=frontend&view=list");
  await expect(page.getByRole("article", { name: "Sofia C." })).toBeVisible();
  await expect(page.getByRole("article", { name: "Selfie" })).toHaveCount(0);
  // No ideas any more (P1-24).
  await expect(page.getByRole("link", { name: "Post an idea" })).toHaveCount(0);
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
    await expect(page.getByRole("article", { name: "Omar B." })).toBeVisible();
    await expect(page.getByRole("article", { name: "Sofia C." })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("a person's page shows their public profile only", async ({ page }) => {
  const response = await page.goto("/people/00000000-0000-4000-a000-000000000201");
  await expect(page.getByRole("article", { name: "Sofia C." })).toBeVisible();
  expect(await response!.text()).not.toContain("seed-201@cornell.edu");

  const paused = await page.goto("/people/00000000-0000-4000-a000-000000000302");
  expect(paused!.status()).toBe(404);
});

test("the board has no horizontal scroll", async ({ page }) => {
  await page.goto("/?view=list");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
