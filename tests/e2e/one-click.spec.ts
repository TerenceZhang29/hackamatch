import { expect, test } from "@playwright/test";
import { signToken } from "../../src/lib/notify/tokens";
import {
  createMatch,
  createUser,
  deleteUser,
  E2E_TOKEN_SECRET,
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

test.afterEach(async () => {
  for (const email of created.splice(0)) await deleteUser(email);
});

const tokenUrl = (payload: Parameters<typeof signToken>[0]) =>
  `/r/${signToken(payload, E2E_TOKEN_SECRET)}`;

async function pair() {
  const ownerEmail = newEmail();
  const builderEmail = newEmail();
  const owner = await createUser(ownerEmail, { name: "Maya Patel", role: "idea" });
  const builder = await createUser(builderEmail, { name: "Sofia Chen", role: "builder" });
  const [idea] = await query<{ id: string }>(
    `insert into public.ideas (owner_id, raw_text, pitch) values ($1, 'Full text', 'Let nurses swap shifts.')
     returning id`,
    [owner],
  );
  // The builder already said they're interested; the owner hasn't answered.
  const matchId = await createMatch(owner, builder, { ideaId: idea!.id, interested: [builder] });
  return { owner, ownerEmail, builder, builderEmail, matchId };
}

const matchRow = async (id: string) =>
  (
    await query<{ a: string; b: string; revealed: boolean }>(
      `select a_response::text as a, b_response::text as b, revealed_at is not null as revealed
       from public.matches where id = $1`,
      [id],
    )
  )[0]!;

test("loading a one-click link changes nothing", async ({ playwright }) => {
  const { owner, matchId } = await pair();
  const url = tokenUrl({ matchId, userId: owner, action: "interested" });

  const scanner = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const response = await scanner.get(url);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Yes, I&#x27;m interested");
  } finally {
    await scanner.dispose();
  }
  const row = await matchRow(matchId);
  expect([row.a, row.b].sort()).toEqual(["interested", "pending"]);
  expect(row.revealed).toBe(false);
});

test("confirming interest reveals the match and emails both people their contacts once", async ({
  page,
}) => {
  const { owner, ownerEmail, builderEmail, matchId } = await pair();
  expect(await readOutbox(ownerEmail)).toEqual([]);

  await page.goto(tokenUrl({ matchId, userId: owner, action: "interested" }));
  await expect(page.getByRole("heading", { name: "Build with Sofia C.?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, I'm interested" }).click();
  await expect(page.getByRole("heading", { name: "It's a match!" })).toBeVisible();
  expect((await matchRow(matchId)).revealed).toBe(true);

  const toOwner = await eventually(
    () => readOutbox(ownerEmail),
    (emails) => emails.length > 0,
  );
  const toBuilder = await readOutbox(builderEmail);
  expect(toOwner).toHaveLength(1);
  expect(toBuilder).toHaveLength(1);
  expect(toOwner[0]!.subject).toBe("It's a match: you and Sofia");
  expect(toOwner[0]!.html).toContain(`mailto:${builderEmail}`);
  expect(toBuilder[0]!.html).toContain(`mailto:${ownerEmail}`);
  expect(toOwner[0]!.text).toContain("15-minute coffee at Cornell Tech");
  expect(toOwner[0]!.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

  // Answering again does not send a second round of emails.
  await page.goto(tokenUrl({ matchId, userId: owner, action: "interested" }));
  await expect(page.getByRole("button", { name: "Yes, I'm interested" })).toHaveCount(0);
  expect(await readOutbox(ownerEmail)).toHaveLength(1);
});

test("a pass can be changed to interested from the same link", async ({ page }) => {
  const { owner, matchId } = await pair();
  await page.goto(tokenUrl({ matchId, userId: owner, action: "pass" }));
  await page.getByRole("button", { name: "Pass" }).click();
  await expect(page.getByRole("heading", { name: "Got it, you passed" })).toBeVisible();
  expect((await matchRow(matchId)).revealed).toBe(false);

  await page.getByRole("button", { name: /Change my answer/ }).click();
  await expect(page.getByRole("heading", { name: "It's a match!" })).toBeVisible();
});

test("tampered and expired links show an error with a sign-in link", async ({ page }) => {
  const { owner, matchId } = await pair();
  const token = signToken({ matchId, userId: owner, action: "interested" }, E2E_TOKEN_SECRET);
  const [data, signature] = token.split(".");
  await page.goto(`/r/${data}.${signature!.slice(0, -2)}xx`);
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fmatches",
  );

  await page.goto(
    tokenUrl({
      matchId,
      userId: owner,
      action: "interested",
      exp: Math.floor(Date.now() / 1000) - 5,
    }),
  );
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

  // A valid token for someone who is not in the match.
  const stranger = await createUser(newEmail());
  await page.goto(tokenUrl({ matchId, userId: stranger, action: "interested" }));
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();
});

test("the footer link pauses matches, and one-click unsubscribe pauses until resumed", async ({
  page,
  request,
}) => {
  const email = newEmail();
  const userId = await createUser(email);
  const pausedUntil = async () =>
    (
      await query<{ p: Date | null }>(`select paused_until as p from public.users where id = $1`, [
        userId,
      ])
    )[0]!.p;

  const url = tokenUrl({ matchId: null, userId, action: "pause" });
  await page.goto(url);
  await page.getByRole("button", { name: "Pause for a week" }).click();
  await expect(page.getByRole("heading", { name: /^Paused until/ })).toBeVisible();
  expect(await pausedUntil()).not.toBeNull();

  await page.getByRole("button", { name: "Turn matches back on" }).click();
  await expect(page.getByText("Matches are back on.")).toBeVisible();
  expect(await pausedUntil()).toBeNull();

  // A GET of the unsubscribe URL only redirects to the confirm page.
  const get = await request.get(`${url}/unsubscribe`, { maxRedirects: 0 });
  expect(get.status()).toBe(303);
  expect(await pausedUntil()).toBeNull();

  const post = await request.post(`${url}/unsubscribe`);
  expect(post.status()).toBe(200);
  expect((await pausedUntil())!.getUTCFullYear()).toBe(9999);
});
