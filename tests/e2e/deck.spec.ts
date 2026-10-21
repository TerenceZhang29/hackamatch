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

async function signInAs(page: Page, role: "idea" | "builder" | "both") {
  const email = newEmail();
  await signInOnboarded(page, email);
  const [me] = await query<{ id: string }>(
    `update public.users set role = $2 where cornell_email = $1 returning id`,
    [email, role],
  );
  return me!.id;
}

/** An idea owner with one idea for the event; returns the owner and the pitch. */
async function ideaFor(eventId: string, pitch: string) {
  const email = newEmail();
  const owner = await createUser(email, { name: `Owner ${pitch.slice(0, 5)}`, role: "idea" });
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    owner,
    eventId,
  ]);
  await query(
    `insert into public.ideas (owner_id, event_id, raw_text, pitch) values ($1, $2, 'Full text', $3)`,
    [owner, eventId, pitch],
  );
  return { owner, email };
}

/** The viewer's card passes (P1-23), by kind. */
async function passes(viewer: string) {
  return query<{ kind: string; target_id: string }>(
    `select kind::text, target_id from public.card_passes where user_id = $1 order by created_at`,
    [viewer],
  );
}

async function builderGoing(eventId: string, name: string) {
  const id = await createUser(newEmail(), { name, role: "builder" });
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    id,
    eventId,
  ]);
  return id;
}

test("a builder sees one idea at a time; Pass and Interested move on to the end", async ({
  page,
}) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "builder");
  await ideaFor(event.id, "Older idea for the deck");
  const newer = await ideaFor(event.id, "Newer idea for the deck");

  await page.goto(`/?event=${event.slug}`);
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Newer idea for the deck" })).toBeVisible();
  await expect(page.getByText("2 left")).toBeVisible();

  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Older idea for the deck" })).toBeVisible();
  await expect(page.getByText("1 left")).toBeVisible();

  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("heading", { name: /No more ideas/ })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  // The empty deck offers the other one.
  await expect(page.getByRole("link", { name: "Find builders" })).toBeVisible();

  // Pass hid the card only (P1-23); Interested answered the pair.
  const answers = await query<{ mine: string }>(
    `select case when user_a = $1 then a_response else b_response end as mine
     from public.matches where $1 in (user_a, user_b) order by created_at`,
    [viewer],
  );
  expect(answers.map((a) => a.mine)).toEqual(["interested"]);
  expect((await passes(viewer)).map((p) => p.kind)).toEqual(["idea"]);
  // Passing on the newer idea sent its owner nothing.
  expect(await readOutbox(newer.email)).toHaveLength(0);
});

test("an idea person sees builders; answering someone waiting on you shows the match", async ({
  page,
}) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "idea");
  const sofia = await builderGoing(event.id, "Sofia Deck");
  await createMatch(viewer, sofia, { interested: [sofia] });

  await page.goto(`/?event=${event.slug}`);
  // Sofia already said Interested, so she's still in the deck, unlike on the board.
  await expect(page.getByRole("article", { name: "Sofia D." })).toBeVisible();
  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("heading", { name: "You matched with Sofia!" })).toBeVisible();
  const sayHi = page.getByRole("link", { name: "Say hi" });
  await expect(sayHi).toHaveAttribute("href", /^\/matches\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Keep going" }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
  await expect(page.getByRole("heading", { name: /You've seen every builder/ })).toBeVisible();

  const mutual = await eventually(
    () => readOutbox(created[0]!),
    (emails) => emails.some((e) => /contact/i.test(e.subject) || /match/i.test(e.subject)),
  );
  expect(mutual.length).toBeGreaterThan(0);
});

test("people who do both start on Ideas; the toggle switches to Builders, one kind per deck", async ({
  page,
}) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "both");
  // Going too, so the event chips show.
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    viewer,
    event.id,
  ]);
  await ideaFor(event.id, "An idea in the ideas deck");
  await builderGoing(event.id, "Bea Builder");

  await page.goto(`/?event=${event.slug}`);
  const toggle = page.getByRole("navigation", { name: "Swipe through" });
  await expect(toggle.getByRole("link", { name: "Ideas" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("article", { name: "An idea in the ideas deck" })).toBeVisible();
  await expect(page.getByText("1 left")).toBeVisible();

  await toggle.getByRole("link", { name: "Builders" }).click();
  await expect(page).toHaveURL(`/?deck=builders&event=${event.slug}`);
  await expect(toggle.getByRole("link", { name: "Builders" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Only people who build: the idea's owner (an idea person) isn't here.
  await expect(page.getByRole("article", { name: "Bea B." })).toBeVisible();
  await expect(page.getByText("1 left")).toBeVisible();
  // The event chips keep the chosen deck.
  await expect(
    page.getByRole("navigation", { name: "Whose cards" }).getByRole("link", { name: "Everyone" }),
  ).toHaveAttribute("href", "/?deck=builders");
});

test("Pass hides only that card: a person's idea stays after passing their person card", async ({
  page,
}) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "both");
  const lea = await builderGoing(event.id, "Lea Both");
  await query(`update public.users set role = 'both' where id = $1`, [lea]);
  await query(
    `insert into public.ideas (owner_id, event_id, raw_text, pitch) values ($1, $2, 'Text', 'Lea''s own idea')`,
    [lea, event.id],
  );

  await page.goto(`/?deck=builders&event=${event.slug}`);
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("heading", { name: /You've seen every builder/ })).toBeVisible();

  await page.goto(`/?deck=ideas&event=${event.slug}`);
  await expect(page.getByRole("article", { name: "Lea's own idea" })).toBeVisible();
  // Interested on the idea makes the match with Lea, and all her cards leave both decks.
  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("heading", { name: /No more ideas/ })).toBeVisible();
  await query(`delete from public.card_passes where user_id = $1`, [viewer]);
  await page.goto(`/?deck=builders&event=${event.slug}`);
  await expect(page.getByRole("heading", { name: /You've seen every builder/ })).toBeVisible();
});

test("Browse all opens the list, which keeps members on it; visitors get the list at /", async ({
  page,
  browser,
}) => {
  await signInAs(page, "builder");
  await page.goto("/");
  await page.getByRole("link", { name: "Browse all" }).click();
  await expect(page).toHaveURL("/?view=list");
  await expect(page.getByRole("navigation", { name: "Board tabs" })).toBeVisible();
  await page.getByRole("link", { name: "Builders" }).click();
  await expect(page).toHaveURL("/?tab=people&view=list");
  await page.getByRole("link", { name: "Discover" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();

  const visitor = await browser.newContext();
  try {
    const visitorPage = await visitor.newPage();
    await visitorPage.goto("/");
    await expect(visitorPage.getByRole("navigation", { name: "Board tabs" })).toBeVisible();
    await expect(visitorPage.getByRole("heading", { name: "Discover" })).toHaveCount(0);
  } finally {
    await visitor.close();
  }
});

test("the deck works without JavaScript", async ({ browser }) => {
  const event = await privateEvent();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await ideaFor(event.id, "A no-script idea");
    const email = newEmail();
    await createUser(email, { role: "builder" });
    // Sign in with JavaScript on, then reuse the session cookies without it.
    const jsContext = await browser.newContext();
    const jsPage = await jsContext.newPage();
    await signInOnboarded(jsPage, newEmail());
    await context.addCookies(await jsContext.cookies());
    await jsContext.close();
    await page.goto(`/?event=${event.slug}`);
    await expect(page.getByRole("article", { name: "A no-script idea" })).toBeVisible();
    await page.getByRole("button", { name: "Pass" }).click();
    await expect(page.getByRole("heading", { name: /No more ideas/ })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Undo takes back the last Pass, and only a Pass", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "builder");
  await ideaFor(event.id, "Second idea to undo");
  await ideaFor(event.id, "First idea to undo");
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
  await expect(page.getByRole("article", { name: "First idea to undo" })).toBeVisible();
  await expect(page.getByText("2 left")).toBeVisible();
  await expect(undo).toHaveCount(0);
  expect(await passes(viewer)).toHaveLength(0);

  // Interested offers no Undo.
  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("article", { name: "Second idea to undo" })).toBeVisible();
  await expect(undo).toHaveCount(0);
});

test("Undo on someone who was waiting on you puts them back in your queue", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "idea");
  const omar = await builderGoing(event.id, "Omar Waiting");
  const matchId = await createMatch(viewer, omar, { interested: [omar] });

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

const setTags = (userId: string, skills: string[], domains: string[] = []) =>
  query(
    `update public.profiles set skills = $2, domains = $3, summary = 'Test summary' where user_id = $1`,
    [userId, skills, domains],
  );

test("cards show what you have in common, and the full profile opens in place", async ({
  page,
}) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "idea");
  await setTags(viewer, ["react", "ml"], ["health"]);
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    viewer,
    event.id,
  ]);
  // Created first, so it's the second card (newest first).
  await builderGoing(event.id, "Next Person");
  const lee = await builderGoing(event.id, "Lee Common");
  await setTags(lee, ["react", "go"], ["health", "climate"]);
  await query(
    `insert into public.ideas (owner_id, event_id, raw_text, pitch) values ($1, $2, 'Secret full text', 'Lee''s side idea')`,
    [lee, event.id],
  );

  await page.goto(`/?event=${event.slug}`);
  const card = page.getByRole("article", { name: "Lee C." });
  // The card's lines: role tags, Looking for, Builds, Ideas (a count), You both, Area.
  await expect(card.getByRole("list", { name: "Role" })).toHaveText(["Builds"]);
  await expect(card.getByText("Builds:")).toBeVisible();
  await expect(card).toContainText("Builds: react, go");
  // Looking for: the hackathons Lee is going to and still looking at, soonest first.
  await expect(card.getByRole("list", { name: "Looking for teammates at" })).toContainText(
    `Deck Hack ${event.slug}`,
  );
  // You both: the shared hackathon first, then shared areas (not skills).
  await expect(card.getByRole("list", { name: "You both" }).getByRole("listitem")).toHaveText([
    `Deck Hack ${event.slug}`,
    "health",
  ]);
  await expect(card.getByRole("list", { name: "Area" })).toContainText("climate");
  // Pitches live on idea cards (P1-23): the person card says how many.
  await expect(card).toContainText("Ideas: 1 idea");
  await expect(card.getByText("Lee's side idea")).toHaveCount(0);
  await expect(card.getByText("All ideas")).toHaveCount(0);

  // A tap anywhere on the card opens the full profile, like the link does.
  await card.getByRole("heading", { name: "Lee C." }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);
  await expect(card.getByText("Hackathons", { exact: true })).toBeVisible();
  await expect(card.getByText("All ideas")).toBeVisible();
  await expect(card.getByText("Lee's side idea")).toBeVisible();
  await expect(card.getByRole("list", { name: "All skills" })).toContainText("react");
  await expect(card.getByText("Secret full text")).toHaveCount(0);
  await expect(page.getByText(/@cornell\.edu/)).toHaveCount(0);

  // Answering from the full profile moves on to the next card, collapsed.
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("article", { name: "Next P." })).toBeVisible();
  await expect(page.getByRole("link", { name: "See full profile" })).toBeVisible();
  await page.getByRole("link", { name: "See full profile" }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);
  // Tapping an expanded card doesn't close it; "Show less" does.
  await page.getByRole("article").getByRole("heading", { name: "Next P." }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);
  await page.getByRole("link", { name: "Show less" }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
});

test("idea cards tick the skills you have", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "builder");
  await setTags(viewer, ["frontend"]);
  const { owner } = await ideaFor(event.id, "An idea that needs frontend");
  await query(`update public.ideas set skills_needed = '{frontend,backend}' where owner_id = $1`, [
    owner,
  ]);

  await page.goto(`/?event=${event.slug}`);
  const needs = page.getByRole("list", { name: "Needs" });
  await expect(needs.getByRole("listitem")).toHaveText(["frontend, you have this", "backend"]);
});

test("event chips narrow the deck; the event page opens its deck", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "builder");
  await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
    viewer,
    event.id,
  ]);
  await ideaFor(event.id, "Only in the chip's pool");

  await page.goto("/");
  const chips = page.getByRole("navigation", { name: "Whose cards" });
  await expect(chips.getByRole("link", { name: "Everyone" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await chips.getByRole("link", { name: `Deck Hack ${event.slug}` }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
  await expect(chips.getByRole("link", { name: `Deck Hack ${event.slug}` })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("article", { name: "Only in the chip's pool" })).toBeVisible();
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(
    page.getByRole("heading", { name: `No more ideas for Deck Hack ${event.slug}` }),
  ).toBeVisible();

  await page.goto(`/e/${event.slug}`);
  await page.getByRole("link", { name: "Find teammates for this event" }).click();
  await expect(page).toHaveURL(`/?event=${event.slug}`);
});

test("arrow keys and swipes answer the card; up opens the full profile", async ({ page }) => {
  const event = await privateEvent();
  const viewer = await signInAs(page, "builder");
  await ideaFor(event.id, "Fourth swipe idea");
  await ideaFor(event.id, "Third swipe idea");
  await ideaFor(event.id, "Second swipe idea");
  await ideaFor(event.id, "First swipe idea");
  const answers = async () =>
    (
      await query<{ mine: string }>(
        `select case when user_a = $1 then a_response else b_response end as mine
         from public.matches where $1 in (user_a, user_b) order by created_at`,
        [viewer],
      )
    ).map((r) => r.mine);
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
  await expect(page.getByRole("article", { name: "First swipe idea" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("article", { name: "Second swipe idea" })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);

  await page.goto(`/?event=${event.slug}`);
  await swipe(220, 0);
  await expect(page.getByRole("article", { name: "Third swipe idea" })).toBeVisible();
  await swipe(-220, 0);
  await expect(page.getByRole("article", { name: "Fourth swipe idea" })).toBeVisible();
  await swipe(0, -160);
  await expect(page).toHaveURL(`/?event=${event.slug}&more=1`);
  expect(await answers()).toEqual(["interested"]);
  expect(await passes(viewer)).toHaveLength(2);
});
