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

const SECRET = "uses a private dataset from St. Luke's";
// The fake LLM's pitch is the first 20 words of the text, so the secret goes after them.
const FILLER =
  "It should be simple, fast and friendly, and work on any phone so that busy people can use it between their other tasks.";

async function newBuilder(page: Page) {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, { role: "I can build", sentence: "I build React apps for health" });
  await expect(page).toHaveURL("/matches?welcome=1");
  return email;
}

async function postIdea(page: Page, text: string) {
  await page.goto("/ideas/new");
  await page.getByLabel("Your idea in one or two sentences").fill(text);
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "How it will look" })).toBeVisible();
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page).toHaveURL(/\/ideas\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

test("a builder posts an idea; it is on the board at once and they become 'both'", async ({
  page,
}) => {
  const email = await newBuilder(page);
  const text = `A mobile app with a backend that helps nurses swap shifts. ${FILLER} It ${SECRET}.`;
  const ideaId = await postIdea(page, text);

  await expect(page.getByText("Your idea", { exact: true })).toBeVisible();
  await expect(page.getByText(SECRET)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toContainText(SECRET);

  const [row] = await query<{ role: string; on_board: boolean; posted: number }>(
    `select u.role::text,
            exists (select 1 from public.public_board_ideas(100, 0) b where b.id = $2) as on_board,
            (select count(*)::int from public.analytics_events e
             where e.user_id = u.id and e.name = 'idea_posted') as posted
     from public.users u where u.cornell_email = $1`,
    [email, ideaId],
  );
  expect(row).toEqual({ role: "both", on_board: true, posted: 1 });

  await eventually(
    () =>
      query<{ ok: boolean }>(`select embedding is not null as ok from public.ideas where id = $1`, [
        ideaId,
      ]),
    (rows) => rows[0]?.ok === true,
  );
});

test("other people see the pitch, never the full text", async ({ page, browser }) => {
  await newBuilder(page);
  const ideaId = await postIdea(
    page,
    `A tool that matches tutors with students. ${FILLER} It ${SECRET}.`,
  );

  // Logged out: pitch and a sign-in prompt, no full text anywhere in the page.
  const visitor = await browser.newContext();
  try {
    const visitorPage = await visitor.newPage();
    const response = await visitorPage.goto(`/ideas/${ideaId}`);
    expect(await response!.text()).not.toContain(SECRET);
    await expect(visitorPage.getByRole("link", { name: "Sign in to connect" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/ideas/${ideaId}`)}`,
    );

    // Signed in as someone else: still no full text.
    const other = newEmail();
    await signIn(visitorPage, other);
    await onboard(visitorPage, { role: "I can build", sentence: "I build Go backends" });
    await expect(visitorPage).toHaveURL("/matches?welcome=1");
    const signedIn = await visitorPage.goto(`/ideas/${ideaId}`);
    expect(await signedIn!.text()).not.toContain(SECRET);
    await expect(visitorPage.getByRole("heading", { level: 1 })).toBeVisible();

    // After a revealed match on the idea, the full text is shown.
    await query(
      `insert into public.matches (user_a, user_b, idea_id, source, a_response, b_response, revealed_at)
       select least(o.id, v.id), greatest(o.id, v.id), $2, 'board', 'interested', 'interested', now()
       from public.users o, public.users v
       where o.id = (select owner_id from public.ideas where id = $2) and v.cornell_email = $1`,
      [other, ideaId],
    );
    await visitorPage.reload();
    await expect(visitorPage.getByText(SECRET)).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test("the owner answers the clarifying question and edits tags and status", async ({ page }) => {
  await newBuilder(page);
  await page.goto("/ideas/new");
  // Under 8 words, so the fake LLM asks a clarifying question.
  await page.getByLabel("Your idea in one or two sentences").fill("A shift swap app");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByLabel("Who is this for?").fill("Nurses in NYC hospitals");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page).toHaveURL(/\/ideas\/[0-9a-f-]{36}$/);
  const ideaId = page.url().split("/").pop()!;

  await eventually(
    () =>
      query<{ raw_text: string; clarifying_question: string | null }>(
        `select raw_text, clarifying_question from public.ideas where id = $1`,
        [ideaId],
      ),
    (rows) => rows[0]?.clarifying_question === null && rows[0].raw_text.includes("Nurses"),
  );

  await page.reload();
  await page.getByLabel("Add to skills needed").fill("ux-design");
  await page.getByLabel("Add to skills needed").press("Enter");
  await page.getByLabel("Area").selectOption("health");
  await page.getByLabel("Scope").selectOption("few_weeks");
  await page.getByRole("button", { name: "Save tags" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.getByRole("button", { name: "Filled" }).click();

  const rows = await eventually(
    () =>
      query<{ skills_needed: string[]; domain: string; scope: string; status: string }>(
        `select skills_needed, domain, scope::text, status::text from public.ideas where id = $1`,
        [ideaId],
      ),
    (r) => r[0]?.status === "filled",
  );
  expect(rows[0]).toEqual({
    skills_needed: expect.arrayContaining(["ux-design"]),
    domain: "health",
    scope: "few_weeks",
    status: "filled",
  });
});

test("an unknown or archived idea is a 404 for others", async ({ page }) => {
  const response = await page.goto(`/ideas/${crypto.randomUUID()}`);
  expect(response!.status()).toBe(404);
  const bad = await page.goto(`/ideas/not-a-uuid`);
  expect(bad!.status()).toBe(404);
});
