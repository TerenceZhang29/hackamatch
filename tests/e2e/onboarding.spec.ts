import { expect, test, type Page } from "@playwright/test";
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

  await page.getByRole("button", { name: "I want to find an idea to build" }).click();

  await page.getByLabel("First name").fill("Test");
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

  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Co-founder" }).click();
  await page.getByLabel("First name").fill("Maya");
  await page.getByLabel("Last name").fill("Patel");
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

  await page.getByLabel("First name").fill("Test");
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

test("a slow LLM: a builder joins with a picked skill; tags fill in afterwards", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I want to find an idea to build" }).click();

  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page
    .getByLabel("What you can build, in one sentence")
    .fill("I build Swift iOS apps [[fake-llm-delay-ms=9000]]");
  await page.getByRole("button", { name: "Continue" }).click();

  // Still reading: a builder joins now by picking a skill (P1-22).
  await expect(
    page.getByText("Still reading your sentence. Pick a skill to join now, or check again."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Join the pool" })).toBeDisabled();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
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
  await page.getByRole("button", { name: "I want to find an idea to build" }).click();
  await page.getByLabel("First name").fill("Test");
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
  await page.getByRole("button", { name: "I have an idea" }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await noOverflow();
  await page
    .getByRole("textbox")
    .fill("A study tool that matches students for late-night problem sets");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Here's what we got" })).toBeVisible();
  await noOverflow();
});

test("pasted LinkedIn text adds tags, and the profile link is stored", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);

  await page.getByRole("button", { name: "I want to find an idea to build" }).click();

  await page.getByLabel("First name").fill("Test");
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

  await page.getByRole("button", { name: "I want to find an idea to build" }).click();

  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Or import from GitHub or LinkedIn").click();
  await page.getByLabel("GitHub profile").fill("https://github.com/someone/some-repo");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText("Paste a GitHub profile link, like github.com/yourname"),
  ).toBeVisible();
  expect((await getUserRow(email))?.onboarded_at).toBeNull();
});

const IDEA_ROUTE = "I have an idea";
const BUILDER_ROUTE = "I want to find an idea to build";

async function startRoute(page: Page, route: string, sentence: string) {
  await page.getByRole("button", { name: route }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox").first().fill(sentence);
  await page.getByRole("button", { name: "Continue" }).click();
}

const roleOf = async (email: string) =>
  (
    await query<{ role: string }>(`select role::text from public.users where cornell_email = $1`, [
      email,
    ])
  )[0]?.role;

test("step 1 asks for one route, before the sentence, and says it can change later", async ({
  page,
}) => {
  await signIn(page, newEmail());
  await expect(
    page.getByRole("group", { name: "Do you have an idea, or do you want to find one to build?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: IDEA_ROUTE })).toBeVisible();
  await expect(page.getByRole("button", { name: BUILDER_ROUTE })).toBeVisible();
  await expect(page.getByRole("button", { name: "Both" })).toHaveCount(0);
  await expect(
    page.getByText("You can change this later in settings. Once you've joined, you can do both."),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: /sentence/ })).toHaveCount(0);
});

test("the idea route is blocked without an idea, on the page and on the server", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await startRoute(page, IDEA_ROUTE, "I want to build a xxx");

  const join = page.getByRole("button", { name: "Join the pool" });
  const message = "We couldn't find an idea in your sentence. Describe what you want to build.";
  await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
  await expect(join).toBeDisabled();
  // No quick picks: skills don't open the idea route.
  await expect(page.getByRole("button", { name: "backend", exact: true })).toHaveCount(0);

  await join.evaluate((button) => button.removeAttribute("disabled"));
  await join.click();
  await expect(page.getByText(message)).toHaveCount(2);
  expect((await getUserRow(email))?.onboarded_at).toBeNull();

  await page.getByRole("button", { name: "Back" }).click();
  await page
    .getByLabel("Your idea in one sentence")
    .fill("A mobile app that helps nurses swap shifts");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your idea, as others will see it")).toBeVisible();
  await join.click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect(await roleOf(email)).toBe("idea");
});

test("the builder route is blocked without a skill; a quick pick lets them join", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await startRoute(page, BUILDER_ROUTE, "I like hackathons");

  const join = page.getByRole("button", { name: "Join the pool" });
  await expect(
    page.getByRole("alert").filter({ hasText: "Add at least one skill to join." }),
  ).toBeVisible();
  await expect(join).toBeDisabled();
  await page.getByRole("button", { name: "backend", exact: true }).click();
  await expect(page.getByText("Add at least one skill to join.")).toHaveCount(0);
  await join.click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect(await roleOf(email)).toBe("builder");
  expect((await getProfile(email))!.skills).toEqual(["backend"]);
});

test("a slow AI on the idea route: check again, then join as a builder instead", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = newEmail();
  await signIn(page, email);
  // Longer than both the 8 s wait and the 30 s background run, so every read fails.
  await startRoute(page, IDEA_ROUTE, "A campus food swap app [[fake-llm-delay-ms=40000]]");

  const join = page.getByRole("button", { name: "Join the pool" });
  await expect(page.getByText("Still reading your idea…")).toBeVisible({ timeout: 15_000 });
  await expect(join).toBeDisabled();
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("We still can't read your idea.")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Join as a builder instead" }).click();
  await expect(
    page.getByText("Still reading your sentence. Pick a skill to join now, or check again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "mobile", exact: true }).click();
  await join.click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect(await roleOf(email)).toBe("builder");
  const [bio] = await query<{ raw_bio: string }>(
    `select raw_bio from public.users where cornell_email = $1`,
    [email],
  );
  expect(bio!.raw_bio).toContain("A campus food swap app");
});

test("a builder's idea is saved as a draft to check and post after joining", async ({
  page,
  browser,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await startRoute(
    page,
    BUILDER_ROUTE,
    "I build React apps and want to build a tool that helps nurses swap shifts",
  );
  await expect(page.getByText("We found an idea in your sentence too.")).toBeVisible();
  await expect(page.getByText("Your idea, as others will see it")).toHaveCount(0);
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect(await roleOf(email)).toBe("builder");

  const [draft] = await query<{ id: string; status: string; has_embedding: boolean }>(
    `select i.id, i.status::text, i.embedding is not null as has_embedding
     from public.ideas i join public.users u on u.id = i.owner_id where u.cornell_email = $1`,
    [email],
  );
  expect(draft).toMatchObject({ status: "draft", has_embedding: false });

  // Nobody else can open it.
  const visitor = await browser.newPage();
  const response = await visitor.goto(`/ideas/${draft!.id}`);
  expect(response?.status()).toBe(404);
  await visitor.close();

  await page.getByRole("link", { name: "Check it and post it" }).click();
  await expect(page).toHaveURL(`/ideas/${draft!.id}`);
  await expect(page.getByRole("heading", { name: "Draft: only you can see it" })).toBeVisible();
  await page.getByRole("button", { name: "Post it" }).click();
  await expect(page.getByText("Posted. Others can see it now.")).toBeVisible();
  expect(await roleOf(email)).toBe("both");
  const posted = await eventually(
    () =>
      query<{ status: string; has_embedding: boolean }>(
        `select status::text, embedding is not null as has_embedding from public.ideas where id = $1`,
        [draft!.id],
      ),
    (rows) => rows[0]?.has_embedding === true,
  );
  expect(posted[0]!.status).toBe("open");
});

test("going back and resubmitting never reuses the first reading", async ({ page }) => {
  test.setTimeout(60_000);
  const email = newEmail();
  await signIn(page, email);
  await startRoute(page, IDEA_ROUTE, "A mobile app that helps nurses swap shifts");
  await expect(page.getByText("Your idea, as others will see it")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page
    .getByLabel("Your idea in one sentence")
    .fill("A campus food swap app [[fake-llm-delay-ms=40000]]");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Still reading your idea…")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Join the pool" })).toBeDisabled();
  expect(await getIdeas(email)).toEqual([]);
});

test("a quick pick on the sentence step becomes a tag and counts as the skill", async ({
  page,
}) => {
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole("button", { name: "I want to find an idea to build" }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What you can build, in one sentence").fill("I like hackathons");
  const pick = page.getByRole("button", { name: "mobile", exact: true });
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("list", { name: "Skills" })).toContainText("mobile");
  await expect(page.getByText("Add at least one skill to join.")).toHaveCount(0);
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");
  expect((await getProfile(email))!.skills).toContain("mobile");
});

test("the first name is required to continue; the last name is optional", async ({ page }) => {
  const email = newEmail();
  await signIn(page, email);
  await page.getByRole("button", { name: "I want to find an idea to build" }).click();
  const next = page.getByRole("button", { name: "Continue" });
  await expect(page.getByLabel("Last name")).toBeVisible();
  await expect(next).toBeDisabled();
  await page.getByLabel("First name").fill("   ");
  await expect(next).toBeDisabled();
  await page.getByLabel("First name").fill("Ana");
  await expect(next).toBeEnabled();
  await next.click();
  await page.getByLabel("What you can build, in one sentence").fill("I build Swift iOS apps");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Join the pool" }).click();
  await expect(page).toHaveURL("/matches?welcome=1");
  const [row] = await query<{ name: string; shown: string }>(
    `select name, public.display_name(name) as shown from public.users where cornell_email = $1`,
    [email],
  );
  expect(row).toEqual({ name: "Ana", shown: "Ana" });
});

test("tag suggestions are a themed list: type, then pick with the keyboard or a click", async ({
  page,
}) => {
  await signIn(page, newEmail());
  await page.getByRole("button", { name: "I want to find an idea to build" }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("What you can build, in one sentence").fill("I like hackathons");
  await page.getByRole("button", { name: "Continue" }).click();

  const input = page.getByRole("combobox", { name: "Add to skills" });
  const list = page.getByRole("listbox", { name: "Suggestions for skills" });
  // A click shows every suggestion, before typing anything.
  await expect(list).toBeHidden();
  await input.click();
  await expect(list).toBeVisible();
  await expect(list.getByRole("option", { name: "backend" })).toBeVisible();
  await input.press("Escape");
  await expect(list).toBeHidden();
  await input.click();
  await expect(list).toBeVisible();
  await input.fill("front");
  await expect(list.getByRole("option")).toHaveText(["frontend"]);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await input.press("ArrowDown");
  await expect(list.getByRole("option", { name: "frontend" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await input.press("Enter");
  await expect(page.getByRole("list", { name: "Skills" })).toContainText("frontend");
  await expect(input).toHaveValue("");

  // Names starting with what's typed come first; a click adds one.
  await input.fill("data");
  await expect(list.getByRole("option").first()).toHaveText(/^data/);
  await list.getByRole("option", { name: "data science" }).click();
  await expect(page.getByRole("list", { name: "Skills" })).toContainText("data science");
  await input.press("Escape");
  await expect(list).toBeHidden();
});
