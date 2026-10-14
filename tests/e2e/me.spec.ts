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

async function newOnboardedUser(
  page: Page,
  role: "I have an idea" | "I can build",
  sentence: string,
) {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role, sentence });
  await expect(page).toHaveURL("/matches?welcome=1");
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

test("edited tags survive a later sentence change", async ({ page }) => {
  const email = await newOnboardedUser(page, "I can build", "I build React apps for health");
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();

  await page.getByRole("button", { name: "Remove react" }).click();
  await page.getByLabel("Add to tools and languages").fill("swift");
  await page.getByLabel("Add to tools and languages").press("Enter");
  await page.getByRole("button", { name: "Save tags" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  let profile = await profileOf(email);
  expect(profile.stack).toEqual(["swift"]);
  expect(profile.user_edited).toBe(true);

  await page.getByLabel("Edit your sentence").fill("I build Python data pipelines for climate");
  await page.getByRole("button", { name: "Save sentence" }).click();

  // The summary is still re-inferred from the new sentence; the edited tags stay.
  profile = await eventually(
    () => profileOf(email),
    (p) => /climate/.test(p.summary),
  );
  expect(profile.stack).toEqual(["swift"]);

  await page.reload();
  await expect(page.getByRole("list", { name: "Tools and languages" })).toContainText("swift");
});

test("pausing takes the user off the board and out of the pool, and resuming brings them back", async ({
  page,
}) => {
  const email = await newOnboardedUser(page, "I can build", "I build Go backends");
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

test("role, events and idea status can be changed", async ({ page }) => {
  const email = await newOnboardedUser(
    page,
    "I have an idea",
    "A mobile app that helps nurses swap shifts at hospitals",
  );
  await page.goto("/me");

  await page.getByRole("group", { name: "Role" }).getByRole("button", { name: "Both" }).click();
  await page.getByRole("button", { name: "Side project" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await page.getByRole("button", { name: /Cornell Tech Fall Hack/ }).click();
  await expect(page.getByRole("button", { name: /Cornell Tech Fall Hack/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page
    .getByRole("group", { name: "Idea status" })
    .getByRole("button", { name: "Filled" })
    .click();

  await eventually(
    () =>
      query<{ role: string; intents: string[]; events: number; status: string }>(
        `select u.role::text, u.intents::text[],
                (select count(*)::int from public.event_interests ei where ei.user_id = u.id) as events,
                (select i.status::text from public.ideas i where i.owner_id = u.id limit 1) as status
         from public.users u where u.cornell_email = $1`,
        [email],
      ),
    (rows) => rows[0]?.status === "filled" && rows[0].events === 1,
  ).then(([row]) =>
    expect(row).toEqual({
      role: "both",
      intents: ["hackathon", "side_project"],
      events: 1,
      status: "filled",
    }),
  );
});

test("deleting the account removes every row and signs out", async ({ page }) => {
  const email = await newOnboardedUser(
    page,
    "I have an idea",
    "A mobile app that helps nurses swap shifts at hospitals",
  );
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
  await newOnboardedUser(page, "I can build", "I build iOS apps in Swift");
  await page.goto("/me");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
