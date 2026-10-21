import { expect, test } from "@playwright/test";
import { signIn } from "./auth";
import {
  countAnalyticsEvents,
  deleteUser,
  eventually,
  getUserRow,
  query,
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

type ProfileRow = {
  summary: string | null;
  skills: string[];
  stack: string[];
  domains: string[];
  user_edited: boolean;
  embedded_at: Date | null;
};

const getProfile = async (email: string) =>
  (
    await query<ProfileRow>(
      `select p.summary, p.skills, p.stack, p.domains, p.user_edited, p.embedded_at
       from public.profiles p join public.users u on u.id = p.user_id
       where u.cornell_email = $1`,
      [email],
    )
  )[0];

type IdeaRow = {
  raw_text: string;
  pitch: string | null;
  skills_needed: string[];
  clarifying_question: string | null;
  has_embedding: boolean;
};

const getIdeas = (email: string) =>
  query<IdeaRow>(
    `select i.raw_text, i.pitch, i.skills_needed, i.clarifying_question,
            i.embedding is not null as has_embedding
     from public.ideas i join public.users u on u.id = i.owner_id
     where u.cornell_email = $1`,
    [email],
  );

test("a builder joins the pool in under a minute with 2 taps, 1 sentence and 1 click", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await expect(page).toHaveURL("/onboarding");
  const started = Date.now();

  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("What you can build, in one sentence")
    .fill("I build React and Python apps, mostly health stuff");
  await page.getByRole("button", { name: "Continue" }).click();

  // With the fake LLM, tags are ready almost at once.
  await expect(page.getByRole("heading", { name: "Here's what we got" })).toBeVisible({
    timeout: 1_000,
  });
  await expect(page.getByRole("list", { name: "Tools and languages" })).toContainText("react");
  await expect(page.getByRole("list", { name: "Tools and languages" })).toContainText("python");
  await expect(page.getByRole("list", { name: "Areas" })).toContainText("health");

  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");
  await expect(page.getByText("You're in the pool")).toBeVisible();
  expect(Date.now() - started).toBeLessThan(60_000);

  const user = await getUserRow(email);
  expect(user?.onboarded_at).not.toBeNull();
  expect(await countAnalyticsEvents("pool_joined", user!.id)).toBe(1);
  expect(await countAnalyticsEvents("onboarding_step_completed", user!.id)).toBe(3);

  const [joined] = await query<{ seconds: number }>(
    `select (props->>'seconds_since_link_click')::int as seconds from public.analytics_events
     where name = 'pool_joined' and user_id = $1`,
    [user!.id],
  );
  expect(joined!.seconds).toBeLessThan(60);

  const profile = await eventually(
    () => getProfile(email),
    (p) => p?.embedded_at != null,
  );
  expect(profile!.stack).toEqual(expect.arrayContaining(["react", "python"]));
  expect(profile!.user_edited).toBe(false);
  // A builder never gets an idea.
  expect(await getIdeas(email)).toEqual([]);
});

test("an idea person's sentence becomes their first idea", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I have an idea" }).click();
  await page.getByRole("button", { name: "Co-founder" }).click();
  await page.getByLabel("First name").fill("Maya Patel");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("Your idea in one sentence")
    .fill("A mobile app that helps nurses swap shifts with a backend for hospitals");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Your idea, as others will see it")).toBeVisible();
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");

  const [user] = await query<{ name: string; role: string; intents: string[] }>(
    `select name, role::text, intents::text[] from public.users where cornell_email = $1`,
    [email],
  );
  expect(user).toEqual({ name: "Maya Patel", role: "idea", intents: ["hackathon", "cofounder"] });

  const ideas = await eventually(
    () => getIdeas(email),
    (rows) => rows.length === 1 && rows[0]!.has_embedding,
  );
  expect(ideas[0]!.pitch).toBeTruthy();
  expect(ideas[0]!.skills_needed).toEqual(expect.arrayContaining(["mobile", "backend"]));
});

test("tag edits, event picks and a clarifying answer are saved", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I have an idea" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Under 8 words, so the fake LLM asks a clarifying question.
  await page.getByLabel("Your idea in one sentence").fill("A shift swap app");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Who is this for?").fill("Nurses at NYC hospitals");
  await page.getByLabel("Add to skills").fill("frontend");
  await page.getByLabel("Add to skills").press("Enter");
  await page.getByRole("button", { name: /Cornell Tech Fall Hack/ }).click();
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");

  const profile = await getProfile(email);
  expect(profile!.skills).toContain("frontend");
  expect(profile!.user_edited).toBe(true);

  const interests = await query<{ slug: string }>(
    `select e.slug from public.event_interests ei
     join public.events e on e.id = ei.event_id
     join public.users u on u.id = ei.user_id
     where u.cornell_email = $1`,
    [email],
  );
  expect(interests).toEqual([{ slug: "cornell-tech-fall-hack" }]);

  const ideas = await eventually(
    () => getIdeas(email),
    (rows) => rows[0]?.clarifying_question === null && rows[0].has_embedding,
  );
  expect(ideas[0]!.raw_text).toContain("Nurses at NYC hospitals");
});

test("a slow LLM does not block joining; tags fill in afterwards", async ({ page }) => {
  test.setTimeout(60_000);
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("What you can build, in one sentence")
    .fill("I build Swift iOS apps [[fake-llm-delay-ms=9000]]");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("We'll fill in your tags in a moment")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect((await getUserRow(email))?.onboarded_at).not.toBeNull();

  const profile = await eventually(
    () => getProfile(email),
    (p) => (p?.stack.length ?? 0) > 0,
    { timeoutMs: 30_000 },
  );
  expect(profile!.stack).toContain("swift");
});

test("an onboarded user is sent past onboarding", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What you can build, in one sentence").fill("I write Go backends");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");

  await page.goto("/onboarding");
  await expect(page).toHaveURL("/matches");
});

test("onboarding has no horizontal scroll on any step", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  const noOverflow = async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  };

  await noOverflow();
  await page.getByRole("button", { name: "Both" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await noOverflow();
  await page.getByRole("textbox").fill("I want to build a study tool and I can do the backend");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Here's what we got" })).toBeVisible();
  await noOverflow();
});

test("pasted LinkedIn text adds tags, and the profile link is stored", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What you can build, in one sentence").fill("I design products");
  await page.getByText("Or import from GitHub or LinkedIn").click();
  await page.getByLabel("LinkedIn profile").fill("linkedin.com/in/e2e-designer/");
  await page
    .getByLabel("Paste your LinkedIn About or Experience")
    .fill("Product designer. I prototype in Figma and run user research for fintech teams.");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("list", { name: "Tools and languages" })).toContainText("figma");
  await expect(page.getByRole("list", { name: "Areas" })).toContainText("fintech");
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");

  const [row] = await query<{ linkedin_url: string; linkedin_text: string }>(
    `select linkedin_url, linkedin_text from public.users where cornell_email = $1`,
    [email],
  );
  expect(row).toEqual({
    linkedin_url: "https://www.linkedin.com/in/e2e-designer",
    linkedin_text:
      "Product designer. I prototype in Figma and run user research for fintech teams.",
  });
});

test("a link that is not a GitHub profile is rejected with a clear message", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Or import from GitHub or LinkedIn").click();
  await page.getByLabel("GitHub profile").fill("https://github.com/someone/some-repo");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText("Paste a GitHub profile link, like github.com/yourname"),
  ).toBeVisible();
  expect((await getUserRow(email))?.onboarded_at).toBeNull();
});

test("no idea and no skill blocks joining; a quick pick unblocks it and they join as a builder", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole("button", { name: "Both" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your idea and what you can build").fill("I want to build a xxx");
  await page.getByRole("button", { name: "Continue" }).click();

  const join = page.getByRole("button", { name: "Join the pool" });
  const warning = page.getByText("Add a skill, or go back and describe your idea, to join.");
  await expect(warning).toBeVisible();
  await expect(join).toBeDisabled();
  await expect(page.getByText("Your idea, as others will see it")).toHaveCount(0);

  // The server refuses too, whatever the page allows.
  await join.evaluate((button) => button.removeAttribute("disabled"));
  await join.click();
  await expect(
    page.getByText("Add a skill, or go back and describe your idea, to join."),
  ).toHaveCount(2);
  expect((await getUserRow(email))?.onboarded_at).toBeNull();

  await page.getByRole("button", { name: "backend", exact: true }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByText("No idea found, so you'll join as a builder.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Skills" })).toContainText("backend");
  await join.click();
  await expect(page).toHaveURL("/matches?welcome=1");

  const [user] = await query<{ id: string; role: string }>(
    `select id, role::text from public.users where cornell_email = $1`,
    [email],
  );
  expect(user!.role).toBe("builder");
  expect(await getIdeas(email)).toEqual([]);
  expect((await getProfile(email))!.skills).toEqual(["backend"]);
});

test("a quick pick on the sentence step becomes a tag and counts as the skill", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole("button", { name: "I can build" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What you can build, in one sentence").fill("I like hackathons");
  const pick = page.getByRole("button", { name: "mobile", exact: true });
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("list", { name: "Skills" })).toContainText("mobile");
  await expect(page.getByText("Add a skill, or go back")).toHaveCount(0);
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect((await getProfile(email))!.skills).toContain("mobile");
});
