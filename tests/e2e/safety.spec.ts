import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./auth";
import {
  createMatch,
  createUser,
  deleteUser,
  eventually,
  markOnboarded,
  query,
  uniqueEmail,
} from "./helpers";

/** Report and block on the web (docs/plans/ios-app.md, phase 2). */

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

async function signInMember(page: Page) {
  const email = newEmail();
  await signIn(page, email);
  await markOnboarded(email);
  const [row] = await query<{ id: string }>(
    `select id from public.users where cornell_email = $1`,
    [email],
  );
  return { id: row!.id, email };
}

test("blocking hides a person until they are unblocked", async ({ page }) => {
  const viewer = await signInMember(page);
  const other = await createUser(newEmail(), { name: "Blake Blocked" });

  await page.goto(`/people/${other}`);
  await expect(page.getByRole("heading", { name: "Blake B.", level: 1 })).toBeVisible();
  await page.getByText("Report or block").click();
  await page.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page).toHaveURL(/\/matches\?blocked=1/);
  await expect(page.getByText("Blocked. You won't see each other again.")).toBeVisible();

  // Gone for the viewer, and the viewer is gone for them.
  expect((await page.goto(`/people/${other}`))?.status()).toBe(404);
  const blocks = await query(
    `select blocker_id, blocked_id from public.blocks where blocker_id = $1`,
    [viewer.id],
  );
  expect(blocks).toEqual([{ blocker_id: viewer.id, blocked_id: other }]);

  await page.goto("/me");
  const blocked = page.getByRole("region", { name: "Blocked people" });
  await expect(blocked.getByText("Blake B.")).toBeVisible();
  await blocked.getByRole("button", { name: "Unblock Blake B." }).click();
  await expect(page.getByRole("region", { name: "Blocked people" })).toHaveCount(0);
  await page.goto(`/people/${other}`);
  await expect(page.getByRole("heading", { name: "Blake B.", level: 1 })).toBeVisible();
});

test("reporting a match closes it, and an admin reviews the report", async ({ page }) => {
  const viewer = await signInMember(page);
  const otherEmail = newEmail();
  const other = await createUser(otherEmail, { name: "Robin Reported" });
  const matchId = await createMatch(viewer.id, other, { interested: [viewer.id, other] });
  await query(`update public.matches set revealed_at = now() where id = $1`, [matchId]);

  await page.goto(`/matches/${matchId}`);
  await page.getByText("Report or block").click();
  await page.getByLabel("Report Robin to HackaMatch").selectOption("harassment");
  await page.getByLabel("What happened? (optional)").fill("Kept messaging after I said no.");
  await page.getByRole("button", { name: "Report and block" }).click();
  await expect(page).toHaveURL(/\/matches\?reported=1/);
  await expect(page.getByText("Reported and blocked. Thank you.")).toBeVisible();

  // The match is gone from the list, and its page is closed.
  await expect(page.getByRole("article", { name: "Robin R." })).toHaveCount(0);
  expect((await page.goto(`/matches/${matchId}`))?.status()).toBe(404);

  const [report] = await query<{ id: string; reason: string; note: string; status: string }>(
    `select id, reason, note, status from public.reports where reporter_id = $1`,
    [viewer.id],
  );
  expect(report).toMatchObject({
    reason: "harassment",
    note: "Kept messaging after I said no.",
    status: "open",
  });
  // Every admin is told, after the response.
  await eventually(
    () =>
      query(
        `select 1 from public.notification_log where kind = 'report' and payload->>'report_id' = $1`,
        [report!.id],
      ),
    (rows) => rows.length > 0,
  );

  // Hidden from everyone but admins.
  expect((await page.goto("/admin/reports"))?.status()).toBe(404);
  await query(`update public.users set is_admin = true where id = $1`, [viewer.id]);
  await page.goto("/admin/reports");
  const row = page.getByRole("row", { name: `Report about ${otherEmail}` });
  await expect(row).toContainText("Harassment or bullying");
  await expect(row).toContainText("Kept messaging after I said no.");
  await expect(row).toContainText(viewer.email);

  await row.getByRole("button", { name: "Pause account" }).click();
  await expect(row.getByRole("button", { name: "Unpause account" })).toBeVisible();
  await row.getByRole("button", { name: "Resolve" }).click();
  // Other tests may have open reports of their own; this one has moved.
  await expect(
    page.getByRole("region", { name: "Resolved reports" }).getByRole("row", {
      name: `Report about ${otherEmail}`,
    }),
  ).toBeVisible();
  const [after] = await query<{ status: string; resolved_by: string }>(
    `select status, resolved_by from public.reports where id = $1`,
    [report!.id],
  );
  expect(after).toEqual({ status: "resolved", resolved_by: viewer.id });
});

test("the terms and the privacy policy are public and linked from sign-up", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(page.getByText("no tolerance for objectionable content")).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "hello@hackamatch.com" }).first()).toBeVisible();
});
