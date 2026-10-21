import { expect, test, type Browser, type Page } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { createUser, deleteUser, eventually, query, readOutbox, uniqueEmail } from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

async function member(
  browser: Browser,
  answers: Parameters<typeof onboard>[1],
): Promise<{ page: Page; email: string; close: () => Promise<void> }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = newEmail();
  await signIn(page, email);
  await onboard(page, answers);
  await expect(page).toHaveURL("/matches?welcome=1");
  return { page, email, close: () => context.close() };
}

const ideaPitchOf = async (email: string) =>
  (
    await query<{ id: string; pitch: string }>(
      `select i.id, i.pitch from public.ideas i join public.users u on u.id = i.owner_id
       where u.cornell_email = $1`,
      [email],
    )
  )[0]!;

test("A says Interested on B's idea, B gets an email, B says Interested, both are revealed", async ({
  browser,
}) => {
  const owner = await member(browser, {
    role: "I have an idea",
    sentence: "A mobile app that helps nurses swap shifts with a backend for hospitals",
  });
  const builder = await member(browser, {
    role: "I want to find an idea to build",
    sentence: "I build React apps for health",
  });
  try {
    const idea = await ideaPitchOf(owner.email);

    // The builder finds the idea on the board's list and says Interested.
    await builder.page.goto("/?view=list");
    // By its link, not its pitch: the same test on the other device makes an identical idea.
    const card = () =>
      builder.page
        .getByRole("article")
        .filter({ has: builder.page.locator(`a[href="/ideas/${idea.id}"]`) });
    await card().getByRole("button", { name: "Interested" }).click();
    await expect(builder.page.getByText("Sent", { exact: true })).toBeVisible();
    await expect(card()).toHaveCount(0);

    // The owner gets one email with one-click links, and no contact details.
    const inbound = await eventually(
      () => readOutbox(owner.email),
      (emails) => emails.length === 1,
    );
    expect(inbound[0]!.subject).toMatch(/is interested in building with you/);
    expect(inbound[0]!.html).toContain("/r/");
    expect(inbound[0]!.html).not.toContain(builder.email);

    // The builder sees it under Sent; the owner sees it waiting, marked New.
    await builder.page.goto("/matches");
    const sent = builder.page.getByRole("region", { name: "Sent" });
    await expect(sent.getByRole("article")).toHaveCount(1);

    await owner.page.goto("/matches");
    const waiting = owner.page.getByRole("region", { name: /Waiting on you/ });
    await expect(waiting.getByRole("article")).toHaveCount(1);
    await expect(waiting.getByText("New")).toBeVisible();
    await expect(waiting.getByText(`Your idea: ${idea.pitch}`)).toBeVisible();
    await waiting.getByRole("button", { name: "Interested" }).click();
    await expect(owner.page.getByText("It's a match!")).toBeVisible();
    await expect(
      owner.page.getByRole("region", { name: /Mutual/ }).getByRole("article"),
    ).toHaveCount(1);

    // Both get the mutual email with the other's address.
    const toOwner = await eventually(
      () => readOutbox(owner.email),
      (emails) => emails.length === 2,
    );
    expect(toOwner[1]!.html).toContain(`mailto:${builder.email}`);
    const toBuilder = await readOutbox(builder.email);
    expect(toBuilder.map((e) => e.subject)).toEqual([expect.stringMatching(/^It's a match/)]);

    const [row] = await query<{ revealed: boolean; source: string }>(
      `select revealed_at is not null as revealed, source::text from public.matches m
       join public.users u on u.id in (m.user_a, m.user_b) where u.cornell_email = $1`,
      [owner.email],
    );
    expect(row).toEqual({ revealed: true, source: "board" });
  } finally {
    await owner.close();
    await builder.close();
  }
});

test("Pass hides the person and sends nothing", async ({ browser }) => {
  const viewer = await member(browser, {
    role: "I want to find an idea to build",
    sentence: "I build Go backends",
  });
  try {
    const target = newEmail();
    // A unique first name: the same test on the other device makes its own target at once.
    const first = `Pass${Date.now() % 1_000_000}`;
    const targetId = await createUser(target, { name: `${first} Target` });
    await viewer.page.goto(`/people/${targetId}`);
    await viewer.page.getByRole("button", { name: "Pass" }).click();
    await expect(viewer.page.getByText("Passed", { exact: true })).toBeVisible();
    await expect(viewer.page.getByText("You passed.")).toBeVisible();
    await viewer.page.goto("/?tab=people");
    await expect(viewer.page.getByRole("article", { name: `${first} T.` })).toHaveCount(0);
    expect(await readOutbox(target)).toEqual([]);
  } finally {
    await viewer.close();
  }
});

test("the 16th Interested in a day is refused", async ({ browser }) => {
  const viewer = await member(browser, {
    role: "I want to find an idea to build",
    sentence: "I build Go backends",
  });
  try {
    const [{ id }] = (await query<{ id: string }>(
      `select id from public.users where cornell_email = $1`,
      [viewer.email],
    )) as [{ id: string }];
    for (let n = 0; n < 15; n++) {
      const other = await createUser(newEmail());
      await query(`select public.respond_to_pair($1, $2, null, 'interested', 'board')`, [
        id,
        other,
      ]);
    }
    const target = newEmail();
    const targetId = await createUser(target, { name: "Limit Target" });
    await viewer.page.goto(`/people/${targetId}`);
    await viewer.page.getByRole("button", { name: "Interested" }).click();
    await expect(viewer.page.getByText("That's 15 today. Back tomorrow.")).toBeVisible();
    expect(await readOutbox(target)).toEqual([]);
  } finally {
    await viewer.close();
  }
});

test("after 3 interest emails in a day, more interest waits on /matches without email", async ({
  browser,
}) => {
  const viewer = await member(browser, {
    role: "I want to find an idea to build",
    sentence: "I build Go backends",
  });
  try {
    const target = newEmail();
    const targetId = await createUser(target, { name: "Popular Person" });
    await query(
      `insert into public.notification_log (user_id, channel, kind, local_date)
       select $1, 'email', 'inbound_interest', (now() at time zone 'America/New_York')::date
       from generate_series(1, 3)`,
      [targetId],
    );

    await viewer.page.goto(`/people/${targetId}`);
    await viewer.page.getByRole("button", { name: "Interested" }).click();
    await expect(viewer.page.getByText("Sent", { exact: true })).toBeVisible();
    await expect(viewer.page.getByText("You said you're interested.")).toBeVisible();
    expect(await readOutbox(target)).toEqual([]);

    const [match] = await query<{ n: number }>(
      `select count(*)::int as n from public.matches where $1 in (user_a, user_b)`,
      [targetId],
    );
    expect(match!.n).toBe(1);
  } finally {
    await viewer.close();
  }
});

test("the board's Interested works without JavaScript", async ({ browser }) => {
  const viewer = await member(browser, {
    role: "I want to find an idea to build",
    sentence: "I build Go backends",
  });
  const target = newEmail();
  const targetId = await createUser(target, { name: "No Script" });
  const cookies = await viewer.page.context().cookies();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(`/people/${targetId}`);
    await page.getByRole("button", { name: "Interested" }).click();
    await expect(page.getByText("Sent", { exact: true })).toBeVisible();
    await eventually(
      () => readOutbox(target),
      (emails) => emails.length === 1,
    );
  } finally {
    await context.close();
    await viewer.close();
  }
});
