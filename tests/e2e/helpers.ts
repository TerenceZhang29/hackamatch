import { randomInt, randomUUID } from "node:crypto";
import pg from "pg";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * A unique address, so parallel tests never read each other's mail. The local
 * part is `e2e-` plus digits, which can never be a real NetID (letters, then digits).
 */
export function uniqueEmail(domain = "cornell.edu") {
  return `e2e-${String(randomInt(0, 1e12)).padStart(12, "0")}@${domain}`;
}

type MailpitSummary = { ID: string; Created: string };

async function searchMail(email: string): Promise<MailpitSummary[]> {
  const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Mailpit search failed: ${response.status}`);
  const body = (await response.json()) as { messages: MailpitSummary[] };
  return body.messages;
}

/** How many emails the local mail catcher holds for this address. */
export async function countMail(email: string) {
  return (await searchMail(email)).length;
}

/**
 * Waits for the newest magic-link email to `email` and returns its link.
 * `after` skips emails from earlier sign-ins by the same address.
 */
export async function getMagicLink(email: string, { after = 0, timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await searchMail(email);
    const newest = messages.toSorted((a, b) => b.Created.localeCompare(a.Created))[0];
    if (newest && messages.length > after) {
      const response = await fetch(`${MAILPIT_URL}/api/v1/message/${newest.ID}`);
      if (!response.ok) throw new Error(`Mailpit message fetch failed: ${response.status}`);
      const message = (await response.json()) as { HTML: string; Text: string };
      const link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML)?.[1];
      if (!link) throw new Error(`No magic link in the email to ${email}`);
      return link.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No magic-link email for ${email} within ${timeoutMs} ms`);
}

async function withDb<T>(run: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Marks a signed-up user as onboarded, standing in for the P1-06 flow. */
export async function markOnboarded(email: string) {
  await withDb(async (client) => {
    const result = await client.query(
      `update public.users set role = 'builder', intents = '{hackathon}', onboarded_at = now()
       where cornell_email = $1`,
      [email],
    );
    if (result.rowCount !== 1) throw new Error(`No user ${email} to mark as onboarded`);
  });
}

export async function getUserRow(email: string) {
  return withDb(async (client) => {
    const result = await client.query<{
      id: string;
      onboarding_started_at: Date | null;
      onboarded_at: Date | null;
    }>(
      `select id, onboarding_started_at, onboarded_at from public.users where cornell_email = $1`,
      [email],
    );
    return result.rows[0] ?? null;
  });
}

export async function countAnalyticsEvents(name: string, userId: string) {
  return withDb(async (client) => {
    const result = await client.query<{ count: string }>(
      `select count(*) from public.analytics_events where name = $1 and user_id = $2`,
      [name, userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
}

/** Moves a user's last_active_at into the past and returns the new value. */
export async function backdateLastActive(email: string, minutesAgo: number) {
  return withDb(async (client) => {
    const result = await client.query<{ last_active_at: Date }>(
      `update public.users set last_active_at = now() - make_interval(mins => $2)
       where cornell_email = $1 returning last_active_at`,
      [email, minutesAgo],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`No user ${email}`);
    return row.last_active_at;
  });
}

export async function getLastActive(email: string) {
  return withDb(async (client) => {
    const result = await client.query<{ last_active_at: Date }>(
      `select last_active_at from public.users where cornell_email = $1`,
      [email],
    );
    return result.rows[0]?.last_active_at ?? null;
  });
}

/** Deletes a test user (cascades to users, profiles and sessions). */
export async function deleteUser(email: string) {
  await withDb((client) => client.query(`delete from auth.users where email = $1`, [email]));
}

/** Runs one SQL query as the postgres superuser and returns its rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
) {
  return withDb(async (client) => (await client.query<T>(sql, params)).rows);
}

/** Polls `read` until `done` accepts its value, for work that finishes after the response. */
export async function eventually<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 20_000, intervalMs = 250 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value)) {
    if (Date.now() > deadline) throw new Error(`Condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    value = await read();
  }
  return value;
}

/**
 * Creates a user directly in the database, skipping sign-in: an auth user
 * (the trigger adds users and profiles rows), optionally onboarded.
 */
export async function createUser(
  email: string,
  opts: { name?: string; role?: "idea" | "builder" | "both"; onboarded?: boolean } = {},
) {
  const id = randomUUID();
  await query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
             jsonb_build_object('name', $3::text), now())`,
    [id, email, opts.name ?? null],
  );
  if (opts.onboarded ?? true) {
    await query(
      `update public.users set role = $2, intents = '{hackathon}', raw_bio = 'Test user',
              onboarded_at = now() where id = $1`,
      [id, opts.role ?? "builder"],
    );
  }
  return id;
}

export interface OutboxEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Emails the fake provider wrote to `.tmp/outbox` for one recipient, oldest first. */
export async function readOutbox(email: string): Promise<OutboxEmail[]> {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = `${process.cwd()}/.tmp/outbox`;
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".json"))
    .sort();
  const emails = await Promise.all(
    files.map(async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8")) as OutboxEmail),
  );
  return emails.filter((e) => e.to === email);
}

/** The secret the e2e web server signs one-click links with (see playwright.config.ts). */
export const E2E_TOKEN_SECRET =
  process.env.RESPONSE_TOKEN_SECRET || "e2e-response-token-secret-not-for-production";

/** Creates a match between two users; `aInterested` marks whichever is user_a as interested. */
export async function createMatch(
  x: string,
  y: string,
  opts: { ideaId?: string | null; interested?: string[]; source?: string } = {},
) {
  const [a, b] = x < y ? [x, y] : [y, x];
  const interested = new Set(opts.interested ?? []);
  const [row] = await query<{ id: string }>(
    `insert into public.matches (user_a, user_b, idea_id, source, a_response, b_response)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      a,
      b,
      opts.ideaId ?? null,
      opts.source ?? "board",
      interested.has(a) ? "interested" : "pending",
      interested.has(b) ? "interested" : "pending",
    ],
  );
  return row!.id;
}

/**
 * Creates a demo profile the way supabase/demo/seed.sql does (no email in
 * auth.users, is_demo, notifications off), going to `eventId`, with one idea.
 * Delete it with deleteDemo(id).
 */
export async function createDemoUser(
  name: string,
  opts: { role?: "idea" | "builder" | "both"; eventId?: string; pitch?: string } = {},
) {
  const id = randomUUID();
  await withDb(async (client) => {
    await client.query("begin");
    await client.query("set local hackamatch.demo_seed = 'on'");
    await client.query(
      `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', null,
               jsonb_build_object('name', $2::text, 'demo_email', $3::text))`,
      [id, name, `demo-${id.slice(0, 8)}@hackamatch.invalid`],
    );
    await client.query(
      `update public.users set is_demo = true, notify_channel = 'none', role = $2,
         intents = '{hackathon}', onboarded_at = now() where id = $1`,
      [id, opts.role ?? "idea"],
    );
    if (opts.pitch) {
      await client.query(
        `insert into public.ideas (owner_id, event_id, raw_text, pitch) values ($1, $2, 'Demo text', $3)`,
        [id, opts.eventId ?? null, opts.pitch],
      );
    }
    if (opts.eventId) {
      await client.query(`insert into public.event_interests (user_id, event_id) values ($1, $2)`, [
        id,
        opts.eventId,
      ]);
    }
    await client.query("commit");
  });
  return id;
}

export async function deleteDemo(id: string) {
  await withDb((client) => client.query(`delete from auth.users where id = $1`, [id]));
}
