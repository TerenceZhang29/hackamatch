import { expect, test, type Page } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { deleteUser, eventually, query, uniqueEmail } from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

async function newOnboardedUser(page: Page) {
  const email = newEmail();
  await signIn(page, email);
  // Sign-up picks: Climate and React (P1-24).
  await onboard(page, { skill: "Full stack" });
  await expect(page).toHaveURL("/");
  return email;
}

const profileOf = async (email: string) =>
  (
    await query<{ skills: string[]; stack: string[]; user_edited: boolean; summary: string }>(
      `select p.skills, p.stack, p.user_edited, p.summary from public.profiles p
       join public.users u on u.id = p.user_id where u.cornell_email = $1`,
      [email],
    )
  )[0]!;

test("areas and skills can be edited; there's no sentence, role or ideas section (P1-24)", async ({
  page,
}) => {
  const email = await newOnboardedUser(page);
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  await expect(page.getByLabel("Edit your sentence")).toHaveCount(0);
  await expect(page.getByText("Role and what you're looking for")).toHaveCount(0);
  await expect(page.getByText("Your ideas")).toHaveCount(0);

  await page.getByLabel("Add to tools and languages").fill("swift");
  await page.getByLabel("Add to tools and languages").press("Enter");
  await page.getByRole("button", { name: "Save tags" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  const profile = await profileOf(email);
  expect(profile.stack).toEqual(["swift"]);
  expect(profile.skills).toEqual(["fullstack"]);

  await page.reload();
  await expect(page.getByRole("list", { name: "Tools and languages" })).toContainText("swift");
});

test("the name is shown and can be changed; the first name is required, the last optional", async ({
  page,
}) => {
  const email = await newOnboardedUser(page);
  const nameOf = async () =>
    (
      await query<{ name: string | null; shown: string }>(
        `select name, public.display_name(name) as shown from public.users where cornell_email = $1`,
        [email],
      )
    )[0]!;

  await page.goto("/me");
  // Sign-up asked for the first name.
  await expect(page.getByLabel("First name")).toHaveValue("Test");
  await expect(page.getByLabel("Last name")).toHaveValue("");

  await page.getByLabel("First name").fill("  Maya ");
  await page.getByLabel("Last name").fill(" Patel ");
  await expect(page.getByText(`Public pages show "Maya P."; matches see "Maya".`)).toBeVisible();
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(await nameOf()).toEqual({ name: "Maya Patel", shown: "Maya P." });

  await page.reload();
  await expect(page.getByText("Maya Patel", { exact: true })).toBeVisible();
  await expect(page.getByLabel("First name")).toHaveValue("Maya");
  await expect(page.getByLabel("Last name")).toHaveValue("Patel");

  // The last name can go; the first name can't.
  await page.getByLabel("Last name").fill("");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  expect(await nameOf()).toEqual({ name: "Maya", shown: "Maya" });
  await page.getByLabel("First name").fill("");
  await expect(page.getByText("Add your first name.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save name" })).toBeDisabled();
});

test("pausing takes the user off the board and out of the pool, and resuming brings them back", async ({
  page,
}) => {
  const email = await newOnboardedUser(page);
  const inPool = async () =>
    (
      await query<{ pool: boolean; board: boolean }>(
        `select exists (select 1 from public.active_pool where cornell_email = $1) as pool,
                exists (select 1 from public.public_board_people(100, 0) b
                        join public.users u on u.id = b.user_id where u.cornell_email = $1) as board`,
        [email],
      )
    )[0]!;

  expect(await inPool()).toEqual({ pool: true, board: true });

  await page.goto("/me");
  await page.getByRole("button", { name: "Pause for a week" }).click();
  await expect(page.getByText(/^Paused until/)).toBeVisible();
  expect(await inPool()).toEqual({ pool: false, board: false });

  const [paused] = await query<{ count: string }>(
    `select count(*) from public.analytics_events e join public.users u on u.id = e.user_id
     where u.cornell_email = $1 and e.name = 'paused'`,
    [email],
  );
  expect(Number(paused!.count)).toBe(1);

  await page.getByRole("button", { name: "Turn matches back on" }).click();
  await expect(page.getByRole("button", { name: "Pause for a week" })).toBeVisible();
  expect(await inPool()).toEqual({ pool: true, board: true });
});

test("hackathons can be changed", async ({ page }) => {
  const email = await newOnboardedUser(page);
  await page.goto("/me");
  await page.getByRole("button", { name: /Cornell Tech Fall Hack/ }).click();
  await expect(page.getByRole("button", { name: /Cornell Tech Fall Hack/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await eventually(
    () =>
      query<{ events: number }>(
        `select (select count(*)::int from public.event_interests ei where ei.user_id = u.id) as events
         from public.users u where u.cornell_email = $1`,
        [email],
      ),
    (rows) => rows[0]?.events === 1,
  );
});

test("deleting the account removes every row and signs out", async ({ page }) => {
  const email = await newOnboardedUser(page);
  const [{ id }] = (await query<{ id: string }>(
    `select id from public.users where cornell_email = $1`,
    [email],
  )) as [{ id: string }];

  await page.goto("/me");
  await expect(page.getByRole("button", { name: "Delete account" })).toBeDisabled();
  await page.getByLabel(/to remove your account/).fill("delete");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL("/?deleted=1");

  const [counts] = await query<{ auth: number; users: number; profiles: number; ideas: number }>(
    `select (select count(*)::int from auth.users where id = $1) as auth,
            (select count(*)::int from public.users where id = $1) as users,
            (select count(*)::int from public.profiles where user_id = $1) as profiles,
            (select count(*)::int from public.ideas where owner_id = $1) as ideas`,
    [id],
  );
  expect(counts).toEqual({ auth: 0, users: 0, profiles: 0, ideas: 0 });

  await page.goto("/me");
  await expect(page).toHaveURL("/login?next=%2Fme");
});

test("/me has no horizontal scroll", async ({ page }) => {
  await newOnboardedUser(page);
  await page.goto("/me");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
