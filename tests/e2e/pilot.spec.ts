import { expect, test } from "@playwright/test";
import { signIn, signInOnboarded } from "./auth";
import { countMail, deleteUser, getUserRow, query, uniqueEmail } from "./helpers";

// The gate is one switch for the whole app: this file runs in its own
// Playwright project, after every other test (playwright.config.ts).
test.describe.configure({ mode: "serial" });

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};
const netid = (email: string) => email.split("@")[0]!;

test.afterAll(async () => {
  await query(`update public.app_settings set pilot_only = false`);
  await query(`delete from public.pilot_access where netid like 'e2e-%'`);
  for (const email of created.splice(0)) await deleteUser(email);
});

test("an admin turns on the gate; only listed netIDs and existing accounts get in", async ({
  page,
}) => {
  const admin = newEmail();
  await signInOnboarded(page, admin);
  await query(`update public.users set is_admin = true where cornell_email = $1`, [admin]);

  const listed = newEmail();
  const unlisted = newEmail();

  await page.goto("/admin/pilot");
  await expect(page.getByRole("heading", { name: "Sign-up gate: off" })).toBeVisible();
  await page.getByRole("button", { name: "Turn the gate on" }).click();
  await expect(page.getByRole("heading", { name: "Sign-up gate: on" })).toBeVisible();

  await page.getByLabel(/NetIDs or Cornell emails/).fill(`${listed.toUpperCase()}, not!valid`);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("1 added. Couldn't read: not!valid")).toBeVisible();
  await expect(page.getByRole("row", { name: netid(listed) })).toContainText("Not yet");

  // Signed out, an unlisted address is refused before any email is sent.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Cornell email").fill(unlisted);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(
    page.getByText("No access for the pilot test. Please contact the admin."),
  ).toBeVisible();
  expect(await countMail(unlisted)).toBe(0);
  expect(await getUserRow(unlisted)).toBeNull();

  // A listed netID signs up.
  await signIn(page, listed);
  await expect(page).toHaveURL("/onboarding");
  expect(await getUserRow(listed)).not.toBeNull();

  // An account made before the gate still signs in, though it isn't listed.
  await page.context().clearCookies();
  await signIn(page, admin);
  await expect(page).toHaveURL("/matches");

  await page.goto("/admin/pilot");
  const row = page.getByRole("row", { name: netid(listed) });
  await expect(row).toContainText("Yes");
  await row.getByRole("button", { name: `Remove ${netid(listed)}` }).click();
  await expect(page.getByRole("row", { name: netid(listed) })).toHaveCount(0);

  await page.getByRole("button", { name: "Turn the gate off" }).click();
  await expect(page.getByRole("heading", { name: "Sign-up gate: off" })).toBeVisible();
});
