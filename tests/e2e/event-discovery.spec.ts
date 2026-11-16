import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { deleteUser, query, uniqueEmail } from "./helpers";

// The weekly hackathon discovery job (docs/plans/event-discovery.md). The job
// itself is unit tested on saved pages (tests/unit/event-discovery.test.ts);
// these check the route's lock and the admin's review.

const created: string[] = [];
const suggestionUrls: string[] = [];
const eventNames: string[] = [];

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
  for (const url of suggestionUrls.splice(0)) {
    await query(`delete from public.event_suggestions where url = $1`, [url]);
  }
  for (const name of eventNames.splice(0)) {
    await query(`delete from public.events where name = $1`, [name]);
  }
});

async function signInAsNewAdmin(page: Page) {
  const email = uniqueEmail();
  created.push(email);
  await signIn(page, email);
  await onboard(page);
  await expect(page).toHaveURL("/");
  await query(`update public.users set is_admin = true where cornell_email = $1`, [email]);
}

async function suggest(overrides: {
  name: string;
  start?: string;
  end?: string;
  draft?: Record<string, unknown> | null;
  pageRead?: boolean;
}) {
  const url = `https://e2e-${randomUUID().slice(0, 8)}.example.org/`;
  suggestionUrls.push(url);
  const rows = await query<{ id: string }>(
    `insert into public.event_suggestions
       (source, name, start_date, end_date, url, url_key, venue, format, draft, page_read)
     values ('mlh', $1, $2, $3, $4, $5, 'Brooklyn, New York', 'in_person', $6, $7)
     returning id`,
    [
      overrides.name,
      overrides.start ?? "2030-02-06",
      overrides.end ?? "2030-02-07",
      url,
      url.replace("https://", "").replace(/\/$/, ""),
      overrides.draft === undefined ? null : JSON.stringify(overrides.draft),
      overrides.pageRead ?? false,
    ],
  );
  return { id: rows[0]!.id, url };
}

async function status(id: string) {
  const rows = await query<{ status: string; event_id: string | null }>(
    `select status, event_id from public.event_suggestions where id = $1`,
    [id],
  );
  return rows[0];
}

test("the cron route refuses a missing or wrong secret", async ({ request }) => {
  const missing = await request.get("/api/cron/discover-events");
  expect(missing.status()).toBe(401);
  const wrong = await request.get("/api/cron/discover-events", {
    headers: { authorization: "Bearer not-the-secret" },
  });
  expect(wrong.status()).toBe(401);
});

test("an admin reviews a suggestion into an event", async ({ page }) => {
  await signInAsNewAdmin(page);
  const name = `E2E Found ${randomUUID().slice(0, 6)}`;
  eventNames.push(name);
  const suggestion = await suggest({
    name,
    pageRead: true,
    draft: {
      description: "A weekend of building for Brooklyn's small businesses.",
      host: "E2E Club",
      prizeTotal: "$5,000",
      perks: ["meals", "mentors"],
      domains: ["fintech"],
    },
  });

  await page.goto("/admin/events");
  const section = page.getByRole("region", { name: "Suggested hackathons" });
  const row = section.getByRole("row", { name });
  await expect(row).toContainText("Brooklyn, New York");
  await expect(row).toContainText("MLH");
  await row.getByRole("link", { name: `Review ${name}` }).click();

  await expect(page.getByRole("heading", { name: `New event: ${name}` })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Filled from MLH" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue(name);
  await expect(page.getByLabel("Start date")).toHaveValue("2030-02-06");
  await expect(page.getByLabel("End date")).toHaveValue("2030-02-07");
  await expect(page.getByLabel("Website (optional)")).toHaveValue(suggestion.url);
  await expect(page.getByLabel("Host (optional)")).toHaveValue("E2E Club");
  await expect(page.getByLabel("Venue (optional)")).toHaveValue("Brooklyn, New York");
  await expect(page.getByLabel("Prize total")).toHaveValue("$5,000");
  await expect(page.getByRole("checkbox", { name: "Meals" })).toBeChecked();
  // Filled fields are outlined until edited.
  await expect(page.getByLabel("Host (optional)")).toHaveClass(/ring-amber-400/);
  await page.getByLabel("Host (optional)").fill("E2E Club NYC");
  await expect(page.getByLabel("Host (optional)")).not.toHaveClass(/ring-amber-400/);

  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page).toHaveURL(/\/admin\/events\?saved=/);
  const rows = await query<{ id: string; host: string; prize_total_cents: number }>(
    `select id, host, prize_total_cents from public.events where name = $1`,
    [name],
  );
  expect(rows[0]).toMatchObject({ host: "E2E Club NYC", prize_total_cents: 500000 });
  expect(await status(suggestion.id)).toEqual({ status: "approved", event_id: rows[0]!.id });
  await expect(
    page.getByRole("row", { name }).getByRole("link", { name: `Review ${name}` }),
  ).toHaveCount(0);

  // A reviewed suggestion can't be reviewed again.
  await page.goto(`/admin/events?suggestion=${suggestion.id}`);
  await expect(page.getByText("That suggestion was already reviewed.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("");
});

test("an admin dismisses a suggestion; ended ones aren't listed", async ({ page }) => {
  await signInAsNewAdmin(page);
  const name = `E2E Skip ${randomUUID().slice(0, 6)}`;
  const ended = `E2E Ended ${randomUUID().slice(0, 6)}`;
  const suggestion = await suggest({ name });
  await suggest({ name: ended, start: "2020-01-01", end: "2020-01-02" });

  await page.goto("/admin/events");
  const section = page.getByRole("region", { name: "Suggested hackathons" });
  const row = section.getByRole("row", { name });
  await expect(row).toContainText("Page not read; fill it in by hand");
  await expect(section.getByRole("row", { name: ended })).toHaveCount(0);

  await row.getByRole("button", { name: `Dismiss ${name}` }).click();
  await expect(section.getByRole("row", { name })).toHaveCount(0);
  expect(await status(suggestion.id)).toEqual({ status: "dismissed", event_id: null });
});
