import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signToken } from "../../src/lib/notify/tokens";
import { onboard, signIn } from "./auth";
import {
  createMatch,
  createUser,
  deleteUser,
  E2E_TOKEN_SECRET,
  query,
  uniqueEmail,
} from "./helpers";

/**
 * Accessibility pass (P1-19): axe on every main page, desktop and mobile.
 * Serious and critical violations fail the test; minor ones are reported.
 */

// No transitions, so axe never measures a color halfway through one.
test.use({ contextOptions: { reducedMotion: "reduce" } });

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  for (const violation of results.violations) {
    const where = violation.nodes
      .map((n) => n.target.join(" "))
      .slice(0, 3)
      .join(" | ");
    console.log(
      `[a11y] ${label}: ${violation.impact} ${violation.id}: ${violation.help} (${where})`,
    );
  }
  expect(
    blocking.map((v) => `${v.id}: ${v.help}`),
    label,
  ).toEqual([]);
}

test("public pages", async ({ page }) => {
  for (const [path, label] of [
    ["/", "board"],
    ["/?tab=people", "builders"],
    ["/login", "login"],
    ["/e/cornell-tech-fall-hack", "event"],
    ["/events", "events"],
    ["/people/00000000-0000-4000-a000-000000000201", "person"],
  ] as const) {
    await page.goto(path);
    await expectAccessible(page, label);
  }
  const [idea] = await query<{ id: string }>(
    `select id from public.ideas where pitch = 'Let nurses swap shifts in minutes instead of days.'`,
  );
  await page.goto(`/ideas/${idea!.id}`);
  await expectAccessible(page, "idea (public)");
});

test("onboarding, every step", async ({ page }) => {
  await signIn(page, newEmail());
  await expectAccessible(page, "onboarding step 1");
  await page.getByRole("button", { name: "I have an idea" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expectAccessible(page, "onboarding step 2");
  await page.getByRole("textbox").first().fill("A shift swap app");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Here's what we got" })).toBeVisible();
  // Scan once the step has settled: the button is disabled (and faded) while it loads.
  await expect(page.getByRole("button", { name: "Join the pool" })).toBeEnabled();
  await expectAccessible(page, "onboarding step 3");
});

test("member pages", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, {
    role: "I have an idea",
    sentence: "A mobile app that helps nurses swap shifts with a backend",
  });
  await expect(page).toHaveURL("/matches?welcome=1");
  const [me] = await query<{ id: string }>(`select id from public.users where cornell_email = $1`, [
    email,
  ]);

  // A waiting match, a mutual match with a team, so /matches has every section.
  const waiting = await createUser(newEmail(), { name: "Waiting Person" });
  await createMatch(me!.id, waiting, { interested: [waiting] });
  const partner = await createUser(newEmail(), { name: "Pair Person" });
  const mutual = await createMatch(me!.id, partner, { interested: [me!.id, partner] });
  await query(`update public.matches set revealed_at = now() where id = $1`, [mutual]);

  await page.goto("/");
  await expectAccessible(page, "deck");
  await page.goto("/?view=list");
  await expectAccessible(page, "board list (member)");
  await page.goto("/matches");
  await expectAccessible(page, "matches");
  // The shell marks the current tab (one "Main" nav is visible per screen size).
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /^Matches/ }),
  ).toHaveAttribute("aria-current", "page");
  await page.goto(`/matches/${mutual}`);
  await expectAccessible(page, "pair page");
  await page.getByRole("button", { name: "We teamed up" }).click();
  await expect(page.getByText("Team saved")).toBeVisible();
  await expectAccessible(page, "pair page with a team");

  await page.goto("/me");
  await expectAccessible(page, "profile");
  await page.goto("/ideas/new");
  await expectAccessible(page, "new idea");
  const [idea] = await query<{ id: string }>(`select id from public.ideas where owner_id = $1`, [
    me!.id,
  ]);
  await page.goto(`/ideas/${idea!.id}`);
  await expectAccessible(page, "idea (owner)");

  // One-click link pages.
  await page.goto(
    `/r/${signToken({ matchId: null, userId: me!.id, action: "pause" }, E2E_TOKEN_SECRET)}`,
  );
  await expectAccessible(page, "pause link");
  const pending = await createMatch(me!.id, await createUser(newEmail(), { name: "Link Person" }));
  await page.goto(
    `/r/${signToken({ matchId: pending, userId: me!.id, action: "interested" }, E2E_TOKEN_SECRET)}`,
  );
  await expectAccessible(page, "answer link");
});

test("admin pages", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role: "I can build", sentence: "I run HackaMatch" });
  await expect(page).toHaveURL("/matches?welcome=1");
  await query(`update public.users set is_admin = true where cornell_email = $1`, [email]);
  for (const path of [
    "/admin",
    "/admin/users",
    "/admin/ideas",
    "/admin/events",
    "/admin/matches",
  ]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});
