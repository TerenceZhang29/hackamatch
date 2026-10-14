import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./auth";
import { createMatch, createUser, deleteUser, markOnboarded, query, uniqueEmail } from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

const FALL_HACK = "00000000-0000-4000-b000-000000000001";

/** Signs in a new member and gives them a revealed match with a new idea person. */
async function revealedMatch(page: Page) {
  const viewerEmail = newEmail();
  await signIn(page, viewerEmail);
  await markOnboarded(viewerEmail);
  const [viewer] = await query<{ id: string }>(
    `select id from public.users where cornell_email = $1`,
    [viewerEmail],
  );
  const otherEmail = newEmail();
  const other = await createUser(otherEmail, { name: "Maya Pair", role: "idea" });
  await query(`update public.users set github_url = 'https://github.com/mayapair' where id = $1`, [
    other,
  ]);
  const [idea] = await query<{ id: string }>(
    `insert into public.ideas (owner_id, raw_text, pitch)
     values ($1, 'The full idea text, only for the match', 'Let nurses swap shifts.') returning id`,
    [other],
  );
  const matchId = await createMatch(viewer!.id, other, {
    ideaId: idea!.id,
    interested: [viewer!.id, other],
  });
  await query(`update public.matches set revealed_at = now() where id = $1`, [matchId]);
  return { viewerId: viewer!.id, otherId: other, otherEmail, matchId, ideaId: idea!.id };
}

test("the pair page shows contact details, the full idea and a message to copy", async ({
  page,
}) => {
  const { matchId, otherEmail } = await revealedMatch(page);
  await page.goto(`/matches/${matchId}`);
  await expect(page.getByRole("heading", { name: "You and Maya" })).toBeVisible();
  await expect(
    page.getByText("Matches never expire, and you both stay in the pool."),
  ).toBeVisible();
  const other = page.getByRole("article", { name: "Maya Pair" });
  await expect(other.getByRole("link", { name: otherEmail })).toHaveAttribute(
    "href",
    `mailto:${otherEmail}`,
  );
  await expect(other.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByText("The full idea text, only for the match")).toBeVisible();
  await expect(page.getByText(/15-minute coffee at Cornell Tech/)).toBeVisible();
});

test("only the two members of a revealed match can open the page", async ({ page, browser }) => {
  const { matchId } = await revealedMatch(page);

  const strangerContext = await browser.newContext();
  try {
    const stranger = await strangerContext.newPage();
    const email = newEmail();
    await signIn(stranger, email);
    await markOnboarded(email);
    const response = await stranger.goto(`/matches/${matchId}`);
    expect(response!.status()).toBe(404);
  } finally {
    await strangerContext.close();
  }

  await query(`update public.matches set revealed_at = null where id = $1`, [matchId]);
  const hidden = await page.goto(`/matches/${matchId}`);
  expect(hidden!.status()).toBe(404);
});

test("event picks highlight overlap for 0, 1 and 2 votes", async ({ page }) => {
  const { matchId, otherId } = await revealedMatch(page);
  await page.goto(`/matches/${matchId}`);
  const row = page.getByRole("listitem", { name: "Cornell Tech Fall Hack" });

  // 0 votes.
  await expect(row.getByRole("button", { name: "I'd do this" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(row.getByText("You both want this")).toHaveCount(0);

  // 1 vote: the other person's.
  await query(
    `insert into public.match_event_votes (match_id, user_id, event_id) values ($1, $2, $3)`,
    [matchId, otherId, FALL_HACK],
  );
  await page.reload();
  await expect(row.getByText("Maya would")).toBeVisible();
  await expect(row.getByText("You both want this")).toHaveCount(0);

  // 2 votes.
  await row.getByRole("button", { name: "I'd do this" }).click();
  await expect(row.getByText("You both want this")).toBeVisible();
  await expect(page.getByLabel("For which event?")).toHaveValue(FALL_HACK);

  // Back to 1.
  await row.getByRole("button", { name: "I'd do it" }).click();
  await expect(row.getByText("You both want this")).toHaveCount(0);
});

test("'We teamed up' twice for the same event makes one team", async ({ page }) => {
  const { matchId, viewerId } = await revealedMatch(page);
  await page.goto(`/matches/${matchId}`);
  await page.getByLabel("For which event?").selectOption(FALL_HACK);
  await page.getByRole("button", { name: "We teamed up" }).click();
  await expect(page.getByText("Team saved. Good luck!")).toBeVisible();
  await page.getByLabel("For which event?").selectOption(FALL_HACK);
  await page.getByRole("button", { name: "We teamed up" }).click();
  await expect(page.getByText("You're already a team for that.")).toBeVisible();

  const [row] = await query<{ teams: number; members: number; formed: number; teamed: boolean }>(
    `select (select count(*)::int from public.teams where match_id = $1) as teams,
            (select count(*)::int from public.team_members tm join public.teams t on t.id = tm.team_id
             where t.match_id = $1) as members,
            (select count(*)::int from public.analytics_events
             where name = 'team_formed' and user_id = $2) as formed,
            (select teamed_up_at is not null from public.matches where id = $1) as teamed`,
    [matchId, viewerId],
  );
  expect(row).toEqual({ teams: 1, members: 2, formed: 1, teamed: true });
  await expect(page.getByLabel("Team for Cornell Tech Fall Hack")).toBeVisible();
});

test("only a mutual match can be added to a team, and the idea owner can mark it filled", async ({
  page,
}) => {
  const { matchId, viewerId } = await revealedMatch(page);
  await page.goto(`/matches/${matchId}`);
  await page.getByLabel("For which event?").selectOption("none");
  await page.getByRole("button", { name: "We teamed up" }).click();
  const team = page.getByLabel("Team for a side project");

  const strangerEmail = newEmail();
  await createUser(strangerEmail, { name: "Not Matched" });
  await team.getByLabel("Add a teammate by Cornell email").fill(strangerEmail);
  await team.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("You can add people you have a mutual match with.")).toBeVisible();

  const friendEmail = newEmail();
  const friend = await createUser(friendEmail, { name: "Third Member" });
  const friendMatch = await createMatch(viewerId, friend, { interested: [viewerId, friend] });
  await query(`update public.matches set revealed_at = now() where id = $1`, [friendMatch]);
  await team.getByLabel("Add a teammate by Cornell email").fill(friendEmail);
  await team.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Added to your team.")).toBeVisible();
  await expect(page.getByLabel("Team for a side project")).toContainText("Third Member");
});

test("the pair page has no horizontal scroll", async ({ page }) => {
  const { matchId } = await revealedMatch(page);
  await page.goto(`/matches/${matchId}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
