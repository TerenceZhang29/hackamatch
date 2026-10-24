import { expect, test } from "@playwright/test";
import { onboard, signIn } from "./auth";
import { deleteUser, eventually, query, readOutbox, uniqueEmail } from "./helpers";

/**
 * The whole Phase 1 loop through the UI, as two students would live it:
 * sign up, find each other on the board, say Interested (one from the board,
 * one from the email), get contact details, pick a hackathon together and
 * record the team. This is the gate metric: teams formed.
 */

const created: string[] = [];
test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

test("two students go from sign-up to a team", async ({ browser }) => {
  test.setTimeout(90_000);
  const mayaEmail = uniqueEmail();
  const sofiaEmail = uniqueEmail();
  created.push(mayaEmail, sofiaEmail);
  const maya = await browser.newContext();
  const sofia = await browser.newContext();

  try {
    // Both sign up (P1-24); Maya builds hardware, Sofia does UX.
    // Unique names: the desktop and mobile projects run this test at the same time.
    const mayaName = `Maya${mayaEmail.slice(4, 10)}`;
    const mayaPage = await maya.newPage();
    await signIn(mayaPage, mayaEmail);
    await onboard(mayaPage, { firstName: mayaName, area: "Health", skill: "Hardware" });
    await expect(mayaPage).toHaveURL("/");

    const sofiaPage = await sofia.newPage();
    await signIn(sofiaPage, sofiaEmail);
    await onboard(sofiaPage, { firstName: "Sofia", area: "Health", skill: "UX design" });
    await expect(sofiaPage).toHaveURL("/");

    // Sofia finds Maya on the board, filtered to her skill.
    await sofiaPage.goto("/?skill=hardware&view=list");
    await sofiaPage
      .getByRole("article", { name: mayaName })
      .getByRole("button", { name: "Interested" })
      .click();
    await expect(sofiaPage.getByText("Sent", { exact: true })).toBeVisible();

    // Maya answers from the email, without opening the app first.
    const [inbound] = await eventually(
      () => readOutbox(mayaEmail),
      (emails) => emails.length === 1,
    );
    const interestedLink = [...inbound!.html.matchAll(/href="([^"]*\/r\/[^"]+)"/g)][0]![1]!;
    // Just the path: the email names APP_URL, and the test server may run on another port.
    const url = new URL(interestedLink.replaceAll("&amp;", "&"));
    await mayaPage.goto(`${url.pathname}${url.search}`);
    await mayaPage.getByRole("button", { name: "Yes, I'm interested" }).click();
    await expect(mayaPage.getByRole("heading", { name: "It's a match!" })).toBeVisible();

    // Both get each other's contact details.
    const toSofia = await eventually(
      () => readOutbox(sofiaEmail),
      (emails) => emails.some((e) => e.subject.startsWith("It's a match")),
    );
    expect(toSofia.find((e) => e.subject.startsWith("It's a match"))!.html).toContain(
      `mailto:${mayaEmail}`,
    );

    // They pick a hackathon together on the shared page.
    await mayaPage.getByRole("link", { name: "Open your match" }).click();
    await expect(mayaPage).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
    const matchUrl = new URL(mayaPage.url()).pathname;
    await mayaPage
      .getByRole("listitem", { name: "Cornell Tech Fall Hack" })
      .getByRole("button", { name: "I'd do this" })
      .click();

    await sofiaPage.goto(matchUrl);
    await expect(sofiaPage.getByRole("link", { name: mayaEmail })).toBeVisible();
    const fallHack = sofiaPage.getByRole("listitem", { name: "Cornell Tech Fall Hack" });
    await fallHack.getByRole("button", { name: "I'd do this" }).click();
    await expect(fallHack.getByText("You both want this")).toBeVisible();

    // Sofia records the team; the event is preselected because they both picked it.
    await sofiaPage.getByRole("button", { name: "We teamed up" }).click();
    await expect(sofiaPage.getByText("Team saved. Good luck!")).toBeVisible();

    await mayaPage.reload();
    await expect(mayaPage.getByLabel("Team for Cornell Tech Fall Hack")).toBeVisible();

    const [result] = await query<{ teams: number; event: string }>(
      `select count(t.id)::int as teams, max(e.slug) as event
       from public.users u
       join public.team_members tm on tm.user_id = u.id
       join public.teams t on t.id = tm.team_id
       left join public.events e on e.id = t.event_id
       where u.cornell_email = $1`,
      [mayaEmail],
    );
    expect(result).toEqual({ teams: 1, event: "cornell-tech-fall-hack" });
  } finally {
    await maya.close();
    await sofia.close();
  }
});
