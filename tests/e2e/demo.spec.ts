import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { signInOnboarded } from "./auth";
import { createDemoUser, deleteDemo, deleteUser, query, readOutbox, uniqueEmail } from "./helpers";

const created: string[] = [];
const demos: string[] = [];
const createdEvents: string[] = [];

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
  for (const id of demos.splice(0)) await deleteDemo(id);
  for (const slug of createdEvents.splice(0)) {
    await query(`delete from public.events where slug = $1`, [slug]);
  }
});

async function privateEvent() {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, $2, current_date + 5, current_date + 6) returning id`,
    [slug, `Demo Hack ${slug.slice(4)}`],
  );
  return { id: event!.id, slug };
}

test("a demo profile is labeled, answers Interested, and nobody gets an email", async ({
  page,
}) => {
  const event = await privateEvent();
  const email = uniqueEmail();
  created.push(email);
  await signInOnboarded(page, email);
  const [viewer] = await query<{ id: string }>(
    `update public.users set role = 'builder' where cornell_email = $1 returning id`,
    [email],
  );
  const demo = await createDemoUser("Dana Demo", {
    eventId: event.id,
    pitch: "A demo idea for the pilot.",
  });
  demos.push(demo);

  await page.goto(`/?event=${event.slug}`);
  const card = page.getByRole("article", { name: "A demo idea for the pilot." });
  await expect(card.getByText("Demo", { exact: true })).toBeVisible();

  // The demo profile says Interested back at once: the match is revealed in the app.
  await page.getByRole("button", { name: "Interested" }).click();
  await expect(page.getByRole("heading", { name: "You matched with Dana!" })).toBeVisible();
  await page.getByRole("link", { name: "Say hi" }).click();
  await expect(page.getByText(/Dana is a demo profile for testing/)).toBeVisible();

  // No email to either person, and nothing was even attempted.
  expect(await readOutbox(email)).toEqual([]);
  const sent = await query<{ n: number }>(
    `select count(*)::int as n from public.notification_log
     where user_id = any ($1::uuid[]) and status = 'sent'`,
    [[viewer!.id, demo]],
  );
  expect(sent[0]!.n).toBe(0);

  // Demo profiles stay out of the pool used for metrics.
  const pool = await query(`select 1 from public.active_pool where id = $1`, [demo]);
  expect(pool).toHaveLength(0);
});

test("list cards label demo people and their ideas, for visitors too", async ({ browser }) => {
  const event = await privateEvent();
  const demo = await createDemoUser("Eli Demo", {
    role: "both",
    eventId: event.id,
    pitch: "Another demo idea.",
  });
  demos.push(demo);
  const visitor = await browser.newContext();
  try {
    const page = await visitor.newPage();
    await page.goto(`/e/${event.slug}`);
    const going = page.getByRole("region", { name: "People going" });
    await expect(
      going.getByRole("article", { name: "Eli D." }).getByText("Demo", { exact: true }),
    ).toBeVisible();
    const ideas = page.getByRole("region", { name: "Ideas for this event" });
    await expect(
      ideas.getByRole("article", { name: "Another demo idea." }).getByText("Demo", { exact: true }),
    ).toBeVisible();
  } finally {
    await visitor.close();
  }
});
