import { randomUUID } from "node:crypto";
import pg from "pg";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const DATABASE_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** A unique address, so parallel tests never read each other's mail. */
export function uniqueEmail(domain = "cornell.edu") {
  return `e2e-${randomUUID().slice(0, 12)}@${domain}`;
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
