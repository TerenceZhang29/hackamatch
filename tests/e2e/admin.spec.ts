import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { createUser, deleteUser, eventually, query, readOutbox, uniqueEmail } from "./helpers";

const created: string[] = [];
const newEmail = () => {
  const email = uniqueEmail();
  created.push(email);
  return email;
};
const createdEvents: string[] = [];

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
  for (const name of createdEvents.splice(0)) {
    await query(`delete from public.events where name = $1`, [name]);
  }
});

async function signInAsNewAdmin(page: Page) {
  const email = newEmail();
  await signIn(page, email);
  await onboard(page);
  await expect(page).toHaveURL("/");
  await query(`update public.users set is_admin = true where cornell_email = $1`, [email]);
  return email;
}

test("every admin page is a 404 for a member who is not an admin", async ({ page }) => {
  await signIn(page, newEmail());
  await onboard(page);
  await expect(page).toHaveURL("/");
  for (const path of [
    "/admin",
    "/admin/users",
    "/admin/events",
    "/admin/matches",
    "/admin/pilot",
  ]) {
    const response = await page.goto(path);
    expect(response!.status(), path).toBe(404);
  }
});

test("an admin creates an event, and edits it without changing its link", async ({ page }) => {
  await signInAsNewAdmin(page);
  const name = `E2E Hack ${randomUUID().slice(0, 6)}`;
  createdEvents.push(name);

  await page.goto("/admin/events");
  // Names are capped at 40 characters: the field stops typing, and the server says why.
  await expect(page.getByLabel("Name")).toHaveAttribute("maxlength", "40");
  await expect(page.getByText("40 characters max, so it fits on cards.")).toBeVisible();
  await page.getByLabel("Name").evaluate((el) => el.removeAttribute("maxlength"));
  await page.getByLabel("Name").fill("A hackathon name that is far too long for a chip");
  await page.getByLabel("Start date").fill("2030-03-01");
  await page.getByLabel("End date").fill("2030-03-02");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("Keep the name to 40 characters or fewer")).toBeVisible();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Start date").fill("2030-03-01");
  await page.getByLabel("End date").fill("2030-02-01");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByText("The end date is before the start date")).toBeVisible();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Start date").fill("2030-03-01");
  await page.getByLabel("End date").fill("2030-03-02");
  await page.getByLabel("Max team size").fill("5");
  // The organizer doesn't need a HackaMatch account.
  await page.getByLabel(/Organizer email/).fill("organizer@example.org");
  // The event page's details (P1-24).
  await page.getByLabel("Time (optional)").fill("9:00 AM – 5:00 PM");
  await page.getByLabel("Venue (optional)").fill("Bloomberg Center");
  await page.getByLabel("Host (optional)").fill("E2E Org");
  await page.getByLabel("Climate", { exact: true }).check();
  await page.getByLabel("AI tools", { exact: true }).check();
  await page.getByRole("button", { name: "Create event" }).click();
  const slug = name.toLowerCase().replaceAll(" ", "-");
  await expect(page.getByRole("status")).toHaveText(`Saved (${slug})`);
  await expect(page.getByRole("row", { name })).toContainText(`/e/${slug}`);

  await page.getByRole("link", { name }).click();
  await page.getByLabel("Name").fill(`${name} (renamed)`);
  await page.getByRole("button", { name: "Save event" }).click();
  createdEvents.push(`${name} (renamed)`);
  await expect(page.getByRole("status")).toHaveText(`Saved (${slug})`);
  const [row] = await query<{
    team_size_max: number;
    organizer_email: string | null;
    organizer_id: string | null;
    time_label: string;
    venue: string;
    host: string;
    domains: string[];
  }>(
    `select team_size_max, organizer_email, organizer_id, time_label, venue, host, domains
     from public.events where slug = $1`,
    [slug],
  );
  expect(row!.team_size_max).toBe(5);
  expect(row).toMatchObject({
    time_label: "9:00 AM – 5:00 PM",
    venue: "Bloomberg Center",
    host: "E2E Org",
    domains: ["climate", "ai-tools"],
  });
  expect(row!.organizer_email).toBe("organizer@example.org");
  expect(row!.organizer_id).toBeNull();
});

test("a manual match emails both people, and each can answer from the email", async ({
  page,
  browser,
}) => {
  await signInAsNewAdmin(page);
  const maya = newEmail();
  const sofia = newEmail();
  await createUser(maya, { name: "Maya Test", role: "idea" });
  await createUser(sofia, { name: "Sofia Test", role: "builder" });

  await page.goto("/admin/matches");
  await page.getByLabel("Person A").fill(`Maya Test <${maya}>`);
  await page.getByLabel("Person B").fill(sofia);
  await page.getByLabel("Why, for A (shown to A)").fill("Sofia builds React apps for health");
  await page.getByLabel("Why, for B (shown to B)").fill("Maya has a health idea");
  await page.getByRole("button", { name: "Create match and email both" }).click();
  await expect(page.getByRole("status")).toHaveText("Match created; both people were emailed.");
  await expect(page.getByRole("row", { name: new RegExp(maya) })).toContainText("admin");

  // A second attempt for the same pair is refused.
  await page.getByLabel("Person A").fill(maya);
  await page.getByLabel("Person B").fill(sofia);
  await page.getByRole("button", { name: "Create match and email both" }).click();
  await expect(page.getByText("These two already have a match.")).toBeVisible();

  const [toMaya] = await eventually(
    () => readOutbox(maya),
    (emails) => emails.length === 1,
  );
  const [toSofia] = await readOutbox(sofia);
  expect(toMaya!.subject).toBe("We think you should meet Sofia");
  expect(toMaya!.html).toContain("Sofia builds React apps for health");
  expect(toSofia!.html).toContain("Maya has a health idea");

  // Both answer Interested from their emails, without signing in.
  const visitor = await browser.newContext();
  try {
    // The email's links are, in order: Interested, Pass, then the pause footer.
    // Just the path: the email names APP_URL, and the test server may run on another port.
    const link = (html: string) => {
      const url = new URL(
        [...html.matchAll(/href="([^"]*\/r\/[^"]+)"/g)][0]![1]!.replaceAll("&amp;", "&"),
      );
      return `${url.pathname}${url.search}`;
    };
    const pageA = await visitor.newPage();
    await pageA.goto(link(toMaya!.html));
    await pageA.getByRole("button", { name: "Yes, I'm interested" }).click();
    await expect(pageA.getByRole("heading", { name: "Thanks, you're interested" })).toBeVisible();
    await pageA.goto(link(toSofia!.html));
    await pageA.getByRole("button", { name: "Yes, I'm interested" }).click();
    await expect(pageA.getByRole("heading", { name: "It's a match!" })).toBeVisible();
  } finally {
    await visitor.close();
  }
});

test("an admin makes someone an organizer", async ({ page }) => {
  await signInAsNewAdmin(page);
  const owner = newEmail();
  await createUser(owner, { name: "Organize Me" });

  await page.goto(`/admin/users?q=${encodeURIComponent(owner)}`);
  await page
    .getByRole("row", { name: owner })
    .getByRole("button", { name: "Make organizer" })
    .click();
  await expect(
    page.getByRole("row", { name: owner }).getByRole("button", { name: "Remove organizer" }),
  ).toBeVisible();

  const [row] = await query<{ organizer: boolean }>(
    `select is_organizer as organizer from public.users where cornell_email = $1`,
    [owner],
  );
  expect(row).toEqual({ organizer: true });
});
