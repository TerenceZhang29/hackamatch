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
    ["/", "landing"],
    ["/?view=list", "board"],
    ["/login", "login"],
    ["/signup", "sign-up step 1"],
    ["/e/cornell-tech-fall-hack", "event"],
    ["/events", "events"],
    ["/people/00000000-0000-4000-a000-000000000201", "person"],
  ] as const) {
    await page.goto(path);
    await expectAccessible(page, label);
  }
});

test("sign-up, every step", async ({ page }) => {
  await page.goto("/signup");
  await expectAccessible(page, "sign-up step 1 (nothing picked)");
  await page.getByRole("button", { name: /Cornell Tech Fall Hack/ }).click();
  await page.getByLabel("Something else?").fill("health");
  await expectAccessible(page, "sign-up step 1 (search)");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectAccessible(page, "sign-up step 2 (nothing picked)");
  await page.getByRole("button", { name: "Climate", exact: true }).click();
  await page.getByLabel("Something special? Search all areas").fill("space");
  await expectAccessible(page, "sign-up step 2");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectAccessible(page, "sign-up step 3 (nothing picked)");
  await page.getByRole("button", { name: "Machine learning", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expectAccessible(page, "sign-up step 4");
});

test("member pages", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page);
  await expect(page).toHaveURL("/");
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
  await page.goto("/events");
  await expectAccessible(page, "events (member)");
  await page.goto("/e/cornell-tech-fall-hack");
  await page.getByRole("button", { name: "I'm going!" }).click();
  await expect(page.getByRole("status")).toContainText("You're going!");
  await expectAccessible(page, "event (going)");

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
  await onboard(page);
  await expect(page).toHaveURL("/");
  await query(`update public.users set is_admin = true where cornell_email = $1`, [email]);
  for (const path of ["/admin", "/admin/users", "/admin/events", "/admin/matches"]) {
    await page.goto(path);
    await expectAccessible(page, path);
  }
});
