import { expect, test } from "@playwright/test";
import { onboard, openMagicLink, signIn } from "./auth";
import { deleteUser, eventually, getMagicLink, getUserRow, query, uniqueEmail } from "./helpers";

/** Sign-up in four steps, email last (P1-24, docs/plans/p1-24-redesign.md). */

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) {
    await query(`delete from public.pending_signups where email = $1`, [email]);
    await deleteUser(email);
  }
});

const profileOf = async (email: string) =>
  (
    await query<{
      name: string;
      skills: string[];
      stack: string[];
      domains: string[];
      events: string[];
    }>(
      `select u.name, p.skills, p.stack, p.domains,
              coalesce(array_agg(e.slug) filter (where e.slug is not null), '{}') as events
       from public.users u
       join public.profiles p on p.user_id = u.id
       left join public.event_interests ei on ei.user_id = u.id
       left join public.events e on e.id = ei.event_id
       where u.cornell_email = $1
       group by u.name, p.skills, p.stack, p.domains`,
      [email],
    )
  )[0];

test("landing: the headline, a hackathon with its date, and Match Now to step 1", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find your Hackathon Partner for",
  );
  const upcoming = page.getByRole("list", { name: "Upcoming hackathons" });
  await expect(
    upcoming.getByRole("link", { name: "Cornell Tech Fall Hack" }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Match Now" }).click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { name: "Pick your hackathon" })).toBeVisible();
});

test("signs up with the email last, and the answers survive the link in a fresh browser", async ({
  page,
  browser,
}) => {
  const email = newEmail();
  await page.goto("/signup");
  await page.getByRole("button", { name: /Cornell Tech Fall Hack/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Climate", exact: true }).click();
  await page.getByLabel("Something special? Search all areas").fill("space");
  await page.getByRole("button", { name: /^Space/ }).click();
  await expect(page.getByText("2 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Machine learning", exact: true }).click();
  await page.getByLabel("Or type it in").fill("rust");
  await page.getByRole("button", { name: "Rust" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("First name").fill("Signup");
  await page.getByLabel("Last name").fill("Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Join HackaMatch" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // Opened somewhere else: a new browser context has no trace of the answers.
  const link = await getMagicLink(email);
  const other = await browser.newContext();
  try {
    const phone = await other.newPage();
    await openMagicLink(phone, link);
    await expect(phone).toHaveURL("/signup/finish");
    await expect(phone.getByRole("heading", { name: "Here's what you told us" })).toBeVisible();
    await expect(phone.getByText("Signup Tester")).toBeVisible();
    await expect(phone.getByText("Climate, Space")).toBeVisible();
    // Nothing is saved before Join.
    expect((await getUserRow(email))?.onboarded_at).toBeNull();
    await phone.getByRole("button", { name: "Join" }).click();
    await expect(phone).toHaveURL("/");
    await expect(phone.getByRole("navigation", { name: "Filter by hackathon" })).toBeVisible();
  } finally {
    await other.close();
  }

  const profile = await eventually(
    () => profileOf(email),
    (p) => Boolean(p),
  );
  expect(profile).toMatchObject({
    name: "Signup Tester",
    skills: ["ml"],
    stack: ["rust"],
    domains: ["climate", "space"],
    events: ["cornell-tech-fall-hack"],
  });
  const [pending] = await query(`select 1 from public.pending_signups where email = $1`, [email]);
  expect(pending).toBeUndefined();
});

test("searches only pick supported names, and the limits hold", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Something else?").fill("Rocket Hack 3000");
  await expect(page.getByText("No results")).toBeVisible();
  await page.getByLabel("Something else?").fill("");
  await page.getByRole("button", { name: "Undecided yet" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  for (const area of ["Health", "Climate", "Fintech", "Education", "Civic tech"]) {
    await page.getByRole("button", { name: area, exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Media", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByLabel("Something special? Search all areas").fill("zzz");
  await expect(page.getByText("No results")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // At least one skill (owner, 2026-10-23).
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByLabel("Or type it in").fill("underwater basket weaving");
  await expect(page.getByText("No results")).toBeVisible();
  for (const skill of ["Frontend", "Backend", "Mobile"]) {
    await page.getByRole("button", { name: skill, exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Pitching", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("signed in but not joined: the same steps without the email", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding/);
  await onboard(page, { firstName: "Onboard", area: "Health", skill: "Pitching" });
  await expect(page).toHaveURL("/");
  const profile = await eventually(
    () => profileOf(email),
    (p) => Boolean(p),
  );
  expect(profile).toMatchObject({ name: "Onboard", skills: ["pitching"], domains: ["health"] });
});
