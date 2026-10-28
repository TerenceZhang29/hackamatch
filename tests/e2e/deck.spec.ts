import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signInOnboarded } from "./auth";
import {
  createMatch,
  createUser,
  deleteUser,
  eventually,
  query,
  readOutbox,
  uniqueEmail,
} from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};
const createdEvents: string[] = [];

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
  for (const slug of createdEvents.splice(0)) {
    await query(`delete from public.events where slug = $1`, [slug]);
  }
});

/** A private event, so the deck narrowed to it (`/?event=`) holds only this test's people. */
async function privateEvent() {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, $2, current_date + 5, current_date + 6) returning id`,
    [slug, `Deck Hack ${slug}`],
  );
  return { id: event!.id, slug };
}

/** Signs in a member and returns their id. There are no roles any more (P1-24). */
async function signInMember(page: Page) {
  const email = newEmail();
  await signInOnboarded(page, email);
  const [me] = await query<{ id: string }>(`select id from public.users where cornell_email = $1`, [
    email,
  ]);
  return me!.id;
}

/** The viewer's card passes (P1-23). */
async function passes(viewer: string) {
  return query<{ kind: string; target_id: string }>(
    `select kind::text, target_id from public.card_passes where user_id = $1 order by created_at`,
    [viewer],
  );
}

/** Someone in the pool going to the event; the newest is the first card. */
async function personGoing(eventId: string, name: string) {
  const email = newEmail();
  const id = await createUser(email, { name });
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    id,
    eventId,
  ]);
  return { id, email };
}

const answersOf = async (viewer: string) =>
  (
    await query<{ mine: string }>(
      `select case when user_a = $1 then a_response else b_response end as mine
       from public.matches where $1 in (user_a, user_b) order by created_at`,
      [viewer],
    )
  ).map((r) => r.mine);

test("one person at a time; Pass and Interested move on to the end", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInMember(page);
  await personGoing(event.id, "Older Person");
  const newer = await personGoing(event.id, "Newer Person");

  await page.goto(`/?event=${event.slug}`);
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Newer P." })).toBeVisible();
  await expect(page.getByText("2 left")).toBeVisible();
  // One deck (P1-24): no Ideas | Builders toggle.
  await expect(page.getByRole("navigation", { name: "Swipe through" })).toHaveCount(0);

  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("article", { name: "Older P." })).toBeVisible();
  await expect(page.getByText("1 left")).toBeVisible();

  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("heading", { name: /You've seen everyone going to/ })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);

  // Pass hid the card only; Interested answered the pair.
  expect(await answersOf(viewer)).toEqual(["interested"]);
  expect((await passes(viewer)).map((p) => p.kind)).toEqual(["person"]);
  // Passing sent nothing.
  expect(await readOutbox(newer.email)).toHaveLength(0);
});

test("answering someone waiting on you shows the match", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInMember(page);
  const sofia = await personGoing(event.id, "Sofia Deck");
  await createMatch(viewer, sofia.id, { interested: [sofia.id] });

  await page.goto(`/?event=${event.slug}`);
  // Sofia already said Interested, so she's still in the deck, unlike on the board.
  await expect(page.getByRole("article", { name: "Sofia D." })).toBeVisible();
  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("heading", { name: "You matched with Sofia!" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Say hi" })).toHaveAttribute(
    "href",
    /^\/matches\/[0-9a-f-]{36}$/,
  );
  await page.getByRole("link", { name: "Keep going" }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
  await expect(page.getByRole("heading", { name: /You've seen everyone/ })).toBeVisible();

  const mutual = await eventually(
    () => readOutbox(created[0]!),
    (emails) => emails.some((e) => /contact/i.test(e.subject) || /match/i.test(e.subject)),
  );
  expect(mutual.length).toBeGreaterThan(0);
});

test("Browse all opens the list, which keeps members on it", async ({ page }) => {
  await signInMember(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Browse all" }).click();
  await expect(page).toHaveURL("/?view=list");
  await expect(page.getByRole("article").first()).toBeVisible();
  // One "Main" nav shows per screen size; on phones the dev overlay covers the bottom bar,
  // so check where the tab goes and follow it.
  await expect(
    page.getByRole("link", { name: "Discover" }).locator("visible=true"),
  ).toHaveAttribute("href", "/");
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
});

test("the deck works without JavaScript", async ({ browser }) => {
  const event = await privateEvent();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await personGoing(event.id, "Noscript Person");
    // Sign in with JavaScript on, then reuse the session cookies without it.
    const jsContext = await browser.newContext();
    const jsPage = await jsContext.newPage();
    await signInOnboarded(jsPage, newEmail());
    await context.addCookies(await jsContext.cookies());
    await jsContext.close();
    await page.goto(`/?event=${event.slug}`);
    await expect(page.getByRole("article", { name: "Noscript P." })).toBeVisible();
    await page.getByRole("button", { name: "Pass" }).click();
    await expect(page.getByRole("heading", { name: /You've seen everyone/ })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Undo takes back the last Pass, and only a Pass", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInMember(page);
  await personGoing(event.id, "Second Undo");
  await personGoing(event.id, "First Undo");
  const undo = page.getByRole("button", { name: "Undo" });
  const matchCount = async () =>
    (
      await query<{ n: number }>(
        `select count(*)::int as n from public.matches where $1 in (user_a, user_b)`,
        [viewer],
      )
    )[0]!.n;

  // A Pass hides the card and records nothing on the pair; Undo brings it back.
  await page.goto(`/?event=${event.slug}`);
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByText("Passed", { exact: true })).toBeVisible();
  expect(await matchCount()).toBe(0);
  expect(await passes(viewer)).toHaveLength(1);
  await undo.click();
  await expect(page.getByRole("article", { name: "First U." })).toBeVisible();
  await expect(page.getByText("2 left")).toBeVisible();
  await expect(undo).toHaveCount(0);
  expect(await passes(viewer)).toHaveLength(0);

  // Interested offers no Undo.
  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("article", { name: "Second U." })).toBeVisible();
  await expect(undo).toHaveCount(0);
});

test("Undo on someone who was waiting on you puts them back in your queue", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInMember(page);
  const omar = await personGoing(event.id, "Omar Waiting");
  const matchId = await createMatch(viewer, omar.id, { interested: [omar.id] });

  await page.goto(`/?event=${event.slug}`);
  await page.getByRole("button", { name: "Pass" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("article", { name: "Omar W." })).toBeVisible();
  const [row] = await query<{ mine: string; theirs: string }>(
    `select case when user_a = $2 then a_response else b_response end as mine,
            case when user_a = $2 then b_response else a_response end as theirs
     from public.matches where id = $1`,
    [matchId, viewer],
  );
  expect(row).toEqual({ mine: "pending", theirs: "interested" });
});

const setTags = (
  userId: string,
  tags: { skills?: string[]; stack?: string[]; domains?: string[] },
) =>
  query(
    `update public.profiles set skills = $2, stack = $3, domains = $4, summary = 'Test summary' where user_id = $1`,
    [userId, tags.skills ?? [], tags.stack ?? [], tags.domains ?? []],
  );

test("the card shows Going to (shared first), areas and top skills; the full profile opens in place", async ({
  page,
}) => {
  const event = await privateEvent();
  const later = await privateEvent();
  await query(`update public.events set start_date = current_date + 2 where id = $1`, [later.id]);
  const viewer = await signInMember(page);
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    viewer,
    event.id,
  ]);
  // Created first, so it's the second card (newest first).
  await personGoing(event.id, "Next Person");
  const lee = await personGoing(event.id, "Lee Common");
  // Lee also goes to a sooner event the viewer isn't going to.
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    lee.id,
    later.id,
  ]);
  await setTags(lee.id, {
    skills: ["frontend", "ml"],
    stack: ["react", "go"],
    domains: ["health", "climate"],
  });

  await page.goto(`/?event=${event.slug}`);
  const card = page.getByRole("article", { name: "Lee C." });
  // Going to: the shared hackathon first (though later), marked "You're going too".
  const going = card.getByRole("list", { name: "Going to" }).getByRole("listitem");
  await expect(going).toHaveCount(2);
  await expect(going.first()).toContainText(`Deck Hack ${event.slug}`);
  await expect(going.first()).toContainText("You're going too");
  await expect(going.nth(1)).toContainText(`Deck Hack ${later.slug}`);
  await expect(card.getByRole("list", { name: "Interest areas" }).getByRole("listitem")).toHaveText(
    ["Health", "Climate"],
  );
  // Top skills: three, stack first.
  await expect(card.getByRole("list", { name: "Top skills" }).getByRole("listitem")).toHaveText([
    "React",
    "Go",
    "Frontend",
  ]);
  // No roles, goals or ideas (P1-24).
  await expect(card.getByText("Looking for")).toHaveCount(0);
  await expect(card.getByText(/Ideas:/)).toHaveCount(0);

  // A tap anywhere on the card opens the full profile, like the link does.
  await card.getByRole("heading", { name: "Lee C." }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);
  await expect(card.getByRole("list", { name: "All skills" })).toContainText("Machine learning");
  await expect(page.getByText(/@cornell\.edu/)).toHaveCount(0);

  // Answering from the full profile moves on to the next card, collapsed.
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("article", { name: "Next P." })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`event=${event.slug}`));
});

test("the hackathon filter narrows the deck; the event page opens it", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInMember(page);
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    viewer,
    event.id,
  ]);
  await personGoing(event.id, "Chip Person");

  await page.goto("/");
  const filter = page.getByRole("navigation", { name: "Filter by hackathon" });
  await expect(filter.getByRole("link", { name: "All hackathons" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The viewer's own hackathons come first after "All hackathons".
  await expect(filter.getByRole("link").nth(1)).toHaveText(`Deck Hack ${event.slug}`);
  await filter.getByRole("link", { name: `Deck Hack ${event.slug}` }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
  await expect(filter.getByRole("link", { name: `Deck Hack ${event.slug}` })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("article", { name: "Chip P." })).toBeVisible();
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(
    page.getByRole("heading", { name: `You've seen everyone going to Deck Hack ${event.slug}` }),
  ).toBeVisible();

  await page.goto(`/e/${event.slug}`);
  await page.getByRole("link", { name: "Discover who's going" }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
});

test("arrow keys answer the card, sideways swipes don't; up opens the full profile", async ({
  page,
}) => {
  const event = await privateEvent();
  const viewer = await signInMember(page);
  for (const name of ["Fourth Swipe", "Third Swipe", "Second Swipe", "First Swipe"]) {
    const person = await personGoing(event.id, name);
    // Enough skills that "See full profile" exists.
    await setTags(person.id, { skills: ["frontend", "backend", "ml", "mobile"] });
  }
  const swipe = async (dx: number, dy: number) => {
    const box = (await page.getByRole("article").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up();
  };

  await page.goto(`/?event=${event.slug}`);
  await expect(page.getByRole("article", { name: "First S." })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("article", { name: "Second S." })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);

  // Swiping sideways no longer answers (owner, 2026-10-27).
  await page.goto(`/?event=${event.slug}`);
  await swipe(220, 0);
  await swipe(-220, 0);
  await expect(page).toHaveURL(`/?event=${event.slug}`);
  await expect(page.getByRole("article", { name: "Second S." })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("article", { name: "Third S." })).toBeVisible();
  await swipe(0, -160);
  await expect(page).toHaveURL(/[?&]more=1/);
  expect(await answersOf(viewer)).toEqual(["interested"]);
  expect(await passes(viewer)).toHaveLength(1);
});
