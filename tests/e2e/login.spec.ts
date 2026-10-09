import { expect, test, type Page } from "@playwright/test";
import {
  backdateLastActive,
  countAnalyticsEvents,
  countMail,
  deleteUser,
  getLastActive,
  getMagicLink,
  getUserRow,
  markOnboarded,
  uniqueEmail,
} from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

/** Requests a magic link from the login page and opens it from the mail catcher. */
async function signIn(page: Page, email: string, loginUrl = "/login") {
  const before = await countMail(email);
  // Supabase Auth allows one email per address per second
  // (auth.email.max_frequency in supabase/config.toml).
  if (before > 0) await page.waitForTimeout(1100);
  await page.goto(loginUrl);
  await page.getByLabel("Cornell email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  const link = await getMagicLink(email, { after: before });
  await openMagicLink(page, link);
  return link;
}

/** Opens a magic link and presses the button that completes the sign-in. */
async function openMagicLink(page: Page, link: string) {
  await page.goto(link);
  await page.getByRole("button", { name: "Continue to HackaMatch" }).click();
}

/** Requests a magic link without opening it, and returns the link. */
async function requestLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Cornell email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  return getMagicLink(email);
}

test("rejects a non-Cornell email before any email is sent", async ({ page }) => {
  const email = uniqueEmail("gmail.com");
  await page.goto("/login");
  await page.getByLabel("Cornell email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  await expect(page.getByText("Use your @cornell.edu email")).toBeVisible();
  await expect(page.getByLabel("Cornell email")).toHaveValue(email);
  expect(await countMail(email)).toBe(0);
  expect(await getUserRow(email)).toBeNull();
});

test("a new user lands on onboarding, a returning onboarded user on matches", async ({ page }) => {
  const email = newEmail();

  await signIn(page, email);
  await expect(page).toHaveURL("/onboarding");
  await expect(page.getByText(email)).toBeVisible();

  const user = await getUserRow(email);
  expect(user?.onboarding_started_at).not.toBeNull();
  expect(await countAnalyticsEvents("magic_link_clicked", user!.id)).toBe(1);

  await markOnboarded(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  // Signed out: protected pages bounce to login and remember where to return.
  await page.goto("/matches");
  await expect(page).toHaveURL("/login?next=%2Fmatches");

  await signIn(page, email);
  await expect(page).toHaveURL("/matches");
  await expect(page.getByRole("heading", { name: "Your matches" })).toBeVisible();

  // The onboarding clock is set on the first click only.
  const again = await getUserRow(email);
  expect(again?.onboarding_started_at).toEqual(user?.onboarding_started_at);
});

test("last_active_at is refreshed at most once per hour", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await expect(page).toHaveURL("/onboarding");

  // Active 10 minutes ago: a new request does not write.
  const recent = await backdateLastActive(email, 10);
  await page.reload();
  await expect(page.getByText(email)).toBeVisible();
  expect(await getLastActive(email)).toEqual(recent);

  // Active 2 hours ago: the next request refreshes it.
  const stale = await backdateLastActive(email, 120);
  await page.reload();
  await expect(page.getByText(email)).toBeVisible();
  const refreshed = await getLastActive(email);
  expect(refreshed!.getTime()).toBeGreaterThan(stale.getTime() + 60 * 60 * 1000);
});

test("returns an onboarded user to a relative next path", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await markOnboarded(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await signIn(page, email, `/login?next=${encodeURIComponent("/?from=idea-card")}`);
  await expect(page).toHaveURL("/?from=idea-card");
});

test("ignores an absolute next URL", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await markOnboarded(email);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await signIn(page, email, "/login?next=https://evil.com");
  await expect(page).toHaveURL("/matches");
});

test("a link requested in one browser signs in when opened in another", async ({
  page,
  browser,
}) => {
  const email = newEmail();
  const link = await requestLink(page, email);

  const otherDevice = await browser.newContext();
  try {
    const otherPage = await otherDevice.newPage();
    await openMagicLink(otherPage, link);
    await expect(otherPage).toHaveURL("/onboarding");
    await expect(otherPage.getByText(email)).toBeVisible();
  } finally {
    await otherDevice.close();
  }
});

test("a plain GET of the link, as a mail scanner does, does not use it up", async ({
  page,
  playwright,
}) => {
  const email = newEmail();
  const link = await requestLink(page, email);

  const scanner = await playwright.request.newContext();
  try {
    const response = await scanner.get(link);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Continue to HackaMatch");
    expect((await scanner.storageState()).cookies).toEqual([]);
  } finally {
    await scanner.dispose();
  }

  // Nothing happened yet: no click recorded, no onboarding clock started.
  const before = await getUserRow(email);
  expect(before?.onboarding_started_at).toBeNull();
  expect(await countAnalyticsEvents("magic_link_clicked", before!.id)).toBe(0);

  await openMagicLink(page, link);
  await expect(page).toHaveURL("/onboarding");
});

test("a used link sends the user back to login, keeping next", async ({ page }) => {
  const email = newEmail();
  const link = await signIn(page, email, `/login?next=${encodeURIComponent("/?from=idea-card")}`);
  await expect(page).toHaveURL(`/onboarding?next=${encodeURIComponent("/?from=idea-card")}`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await openMagicLink(page, link);
  await expect(page).toHaveURL(`/login?error=link&next=${encodeURIComponent("/?from=idea-card")}`);
  await expect(page.getByText("expired or was already used")).toBeVisible();
});

test("a link without a valid token returns to login and drops an absolute next", async ({
  page,
}) => {
  await page.goto("/auth/confirm?next=https://evil.com");
  await expect(page).toHaveURL("/login?error=link");
  await expect(page.getByText("expired or was already used")).toBeVisible();

  await page.goto("/auth/confirm?next=https://evil.com&token_hash=not-a-real-token&type=email");
  await page.getByRole("button", { name: "Continue to HackaMatch" }).click();
  await expect(page).toHaveURL("/login?error=link");
});

test("protected routes redirect to login when signed out", async ({ page }) => {
  for (const path of ["/me", "/matches/abc", "/ideas/new", "/organizer/events", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
  }
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("login and confirm pages have no horizontal scroll", async ({ page }) => {
  for (const path of ["/login", "/auth/confirm?next=&token_hash=abc&type=email"]) {
    await page.goto(path);
    await expect(page.getByRole("button")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
