import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { onboard, signIn, signInOnboarded } from "./auth";
import { createUser, deleteUser, markOnboarded, query, uniqueEmail } from "./helpers";

// P1-25 (docs/plans/p1-25-event-details.md): more event details, and
// "Fill from event site" (the fake model locally).

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

/** An event with every detail filled in, starting in 30 days; apply by in 9. */
async function detailedEvent() {
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date, host, venue, url, domains,
       format, length_hours, entry_fee_cents, open_to, level, apply_by, apply_url, admission,
       capacity, prize_total_cents, prizes, tracks, tools, judging, schedule, perks, perk_notes,
       chat_url, details_updated_at)
     values ($1, $2, current_date + 30, current_date + 31, 'E2E Lab', 'Roosevelt Island',
       'https://example.org/hack', '{health}', 'in_person', 24, 0, 'All students, 18+',
       'beginner', (now() at time zone 'America/New_York')::date + 9, 'https://example.org/apply', 'application', 300, 1200000,
       '[{"label":"1st place","amountCents":500000,"note":null}]',
       '[{"name":"Less paperwork","description":"Draft clinical notes.","skills":["ml","backend"]}]',
       'cloud credits', '[{"criterion":"Impact","weightPct":30}]',
       '[{"date":null,"time":"10:00 AM","label":"Check-in"}]',
       '{meals,mentors}', 'Bring a laptop.', 'https://discord.gg/example', now())
     returning id`,
    [slug, `Detail Hack ${slug.slice(4)}`],
  );
  return { id: event!.id, slug, name: `Detail Hack ${slug.slice(4)}` };
}

/** `n` people in the event's pool, half with Backend. */
async function peopleGoing(eventId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const id = await createUser(newEmail(), { name: `Going ${i}` });
    await query(`update public.profiles set skills = $2 where user_id = $1`, [
      id,
      i % 2 ? ["backend"] : ["frontend"],
    ]);
    await query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
      id,
      eventId,
    ]);
  }
}

test("the event page shows the details that are set, and hides the rest", async ({ page }) => {
  const event = await detailedEvent();

  // Signed out, the tracks are behind sign-in, and not in the page at all.
  const response = await page.goto(`/e/${event.slug}`);
  const lockedTracks = page.getByRole("region", { name: "Tracks" });
  await expect(lockedTracks.getByText("Sign in to view the tracks and details")).toBeVisible();
  await expect(lockedTracks.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    `/login?next=%2Fe%2F${event.slug}`,
  );
  // Only a production build (CI) can show this: the dev server adds every
  // server component's props to the page for debugging.
  if (process.env.CI) {
    expect(await response!.text()).not.toMatch(/Less paperwork|Draft clinical notes/);
  }
  await expect(page.getByRole("region", { name: "At a glance" })).toBeVisible();

  // Signed in but not joined yet: the same lock, asking them to finish joining.
  const email = newEmail();
  await signIn(page, email);
  await page.goto(`/e/${event.slug}`);
  await expect(lockedTracks.getByRole("link", { name: "Finish joining" })).toHaveAttribute(
    "href",
    `/onboarding?next=%2Fe%2F${event.slug}`,
  );
  await expect(
    lockedTracks.getByText("Finish joining to view the tracks and details"),
  ).toBeVisible();

  // A member sees the tracks.
  await markOnboarded(email);
  await page.reload();
  await expect(page.getByText(/to view the tracks and details/)).toHaveCount(0);
  const glance = page.getByRole("region", { name: "At a glance" });
  await expect(glance.getByText("In person")).toBeVisible();
  await expect(glance.getByText("2–4 people")).toBeVisible();
  await expect(glance.getByText("24 hours of hacking")).toBeVisible();
  await expect(glance.getByText("Free")).toBeVisible();
  await expect(glance.getByText("Beginner friendly")).toBeVisible();
  await expect(glance.getByRole("link", { name: /example\.org/ })).toHaveAttribute(
    "href",
    "https://example.org/hack",
  );
  await expect(glance.getByRole("link", { name: /discord\.gg/ })).toBeVisible();
  await expect(glance.getByText(/Apply by .* · 9 days left/)).toBeVisible();
  await expect(glance.getByText("300 spots. They pick by application.")).toBeVisible();

  const track = page.getByRole("article", { name: "Less paperwork" });
  await expect(track.getByRole("list", { name: "Skills that help" })).toHaveText(
    /Machine learning.*Backend/,
  );
  await expect(page.getByText("$12,000 total")).toBeVisible();
  await expect(page.getByRole("region", { name: "How it's judged" })).toContainText("30%");
  await expect(page.getByRole("region", { name: "Schedule" })).toContainText("Check-in");
  await expect(page.getByRole("region", { name: "What's included" })).toContainText(
    "Mentors on site",
  );
  // The apply button sits with the deadline, in At a glance.
  await expect(glance.getByRole("link", { name: "Apply on the event site" })).toHaveAttribute(
    "href",
    "https://example.org/apply",
  );

  // An event without details shows only what it always did.
  await page.goto("/e/cornell-tech-fall-hack");
  await expect(page.getByRole("region", { name: "At a glance" })).toBeVisible();
  for (const name of ["Tracks", "Prizes", "How it's judged", "Schedule", "What's included"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
  }
});

test("I'm going! and Discover who's going stay in view while scrolling on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const event = await detailedEvent();
  await signInOnboarded(page, newEmail());
  await page.goto(`/e/${event.slug}`);
  const going = page.getByRole("button", { name: "I'm going!" });
  const discover = page.getByRole("link", { name: "Discover who's going" });
  await expect(going).toBeInViewport();
  await page.getByRole("region", { name: "What's included" }).scrollIntoViewIfNeeded();
  await expect(going).toBeInViewport();
  await expect(discover).toBeInViewport();

  // Once going, the bar keeps Discover; the status sits in the page.
  await going.click();
  await expect(page.getByRole("status")).toContainText("You're going!");
  await expect(page.getByRole("button", { name: "I'm going!" })).toHaveCount(0);
  await expect(discover).toBeInViewport();
});

test("who's going: members see who still needs a team and the top skills from 5 people", async ({
  page,
}) => {
  const event = await detailedEvent();
  await peopleGoing(event.id, 4);

  // Visitors see the count only.
  await page.goto(`/e/${event.slug}`);
  await expect(page.getByText("4 people going", { exact: true })).toBeVisible();
  await expect(page.getByText(/still need a team/)).toHaveCount(0);

  await signInOnboarded(page, newEmail());
  await page.goto(`/e/${event.slug}`);
  await expect(page.getByText("4 still need a team")).toBeVisible();
  // Under 5 going, no skill bars.
  await expect(page.getByRole("list", { name: "Top skills of people going" })).toHaveCount(0);

  await peopleGoing(event.id, 1);
  await page.reload();
  await expect(page.getByRole("list", { name: "Top skills of people going" })).toContainText(
    "Frontend",
  );
});

test("the events list shows each event's key facts", async ({ page }) => {
  const event = await detailedEvent();
  await peopleGoing(event.id, 2);
  await signInOnboarded(page, newEmail());
  await page.goto("/events");
  const row = page.getByRole("link", { name: new RegExp(event.name) });
  for (const fact of ["$12k prizes", "24 hours", "Beginner friendly", "Free"]) {
    await expect(row.getByText(fact, { exact: true })).toBeVisible();
  }
  await expect(row).toContainText("2 going · 2 need a team");
  await expect(row).toContainText(/Apply by /);
});

async function signInAsNewAdmin(page: Page) {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page);
  await expect(page).toHaveURL("/");
  await query(`update public.users set is_admin = true where cornell_email = $1`, [email]);
}

const formatOf = async (slug: string) =>
  (
    await query<{ format: string | null }>(`select format from public.events where slug = $1`, [
      slug,
    ])
  )[0]!.format;

test("an admin fills an event from its page text, checks it, and saves", async ({ page }) => {
  await signInAsNewAdmin(page);
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  createdEvents.push(slug);
  const [event] = await query<{ id: string }>(
    `insert into public.events (slug, name, start_date, end_date)
     values ($1, 'Fill Hack', current_date + 20, current_date + 21) returning id`,
    [slug],
  );

  await page.goto(`/admin/events/${event!.id}`);
  await page.getByText("The site loads with JavaScript? Paste the page's text instead").click();
  await page
    .getByLabel("Event page text")
    .fill(
      [
        "Description: A weekend of building health tools with clinicians.",
        "In person at Roosevelt Island. Beginners welcome, and it's free.",
        "$12,000 in prizes. Meals and mentors all weekend.",
        "Track: Less paperwork - draft clinical notes with machine learning and a backend",
      ].join("\n"),
    );
  await page.getByRole("button", { name: "Fill from event site" }).click();
  await expect(page.getByRole("status")).toContainText(/Filled \d+ fields from the event site/);
  await expect(page.getByLabel("Format")).toHaveValue("in_person");
  await expect(page.getByLabel("Level")).toHaveValue("beginner");
  await expect(page.getByLabel("Prize total")).toHaveValue("$12,000");
  await expect(page.getByLabel("Entry fee")).toHaveValue("Free");
  await expect(page.getByLabel("Tracks")).toHaveValue(/^Less paperwork \| draft clinical notes/);
  await expect(page.getByRole("checkbox", { name: "Meals" })).toBeChecked();
  await expect(page.getByLabel("Description", { exact: false })).toHaveValue(
    "A weekend of building health tools with clinicians.",
  );
  // Nothing is saved until the admin presses Save.
  expect(await formatOf(slug)).toBeNull();

  // The admin's own edit survives a second fill.
  await page.getByLabel("Prize total").fill("$15,000");
  await page.getByRole("button", { name: "Fill from event site" }).click();
  await expect(page.getByRole("status")).toContainText(/Filled|Nothing new/);
  await expect(page.getByLabel("Prize total")).toHaveValue("$15,000");

  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page).toHaveURL(/\/admin\/events\?saved=/);
  expect(await formatOf(slug)).toBe("in_person");
  await page.goto(`/e/${slug}`);
  await expect(page.getByText("$15,000 total")).toBeVisible();
  await expect(page.getByRole("article", { name: "Less paperwork" })).toBeVisible();
});

test("the admin form refuses a link that isn't https, and an empty fill says what to do", async ({
  page,
}) => {
  await signInAsNewAdmin(page);
  const event = await detailedEvent();
  await page.goto(`/admin/events/${event.id}`);
  await expect(page.getByLabel("Tracks")).toHaveValue(/^Less paperwork \| Draft clinical notes\./);
  await page.getByLabel("Chat link (https)").fill("http://insecure.example");
  await page.getByRole("button", { name: "Save event" }).click();
  await expect(page.getByText("The chat link must be an https link")).toBeVisible();

  // No link and no text: nothing to read.
  await page.goto("/admin/events");
  await page.getByRole("button", { name: "Fill from event site" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Add the event's link, or paste its page text",
  );
});
