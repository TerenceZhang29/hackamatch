import { expect, type Page } from "@playwright/test";
import { countMail, getMagicLink, markOnboarded } from "./helpers";

/** Requests a magic link from the login page and opens it from the mail catcher. */
export async function signIn(page: Page, email: string, loginUrl = "/login") {
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
export async function openMagicLink(page: Page, link: string) {
  // The link names APP_URL; open its path on the server under test, whatever its port.
  const url = new URL(link);
  await page.goto(`${url.pathname}${url.search}`);
  await page.getByRole("button", { name: "Continue to HackaMatch" }).click();
  // Wait for the sign-in to finish (or fail), so callers start from a settled page.
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/confirm"));
}

/** Requests a magic link without opening it, and returns the link. */
export async function requestLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Cornell email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  return getMagicLink(email);
}

/** Signs in a new user and puts them straight in the pool, skipping the onboarding UI. */
export async function signInOnboarded(page: Page, email: string) {
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await markOnboarded(email);
}

/**
 * Goes through the four sign-up steps in the UI (P1-24), signed in already
 * (so no email step), and joins the pool.
 */
export async function onboard(
  page: Page,
  answers: { firstName?: string; area?: string; skill?: string } = {},
) {
  await page.getByRole("button", { name: "Undecided yet" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: answers.area ?? "Climate", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByRole("button", { name: answers.skill ?? "Machine learning", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name").fill(answers.firstName ?? "Test");
  await page.getByRole("button", { name: "Join HackaMatch" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}
