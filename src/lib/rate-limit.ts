/**
 * Rate-limit rules (P1-18). Counting happens in Postgres
 * (`hit_rate_limit`, via src/server/rate-limit.ts); this file only names the
 * limits and builds keys, so it can be unit tested.
 */

export interface Limit {
  /** Prefix of the counter key; the subject (an email, an IP, a user id) follows it. */
  name: string;
  max: number;
  windowSeconds: number;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export const LIMITS = {
  /** Sign-in emails per address. */
  loginEmail: { name: "login:email", max: 5, windowSeconds: HOUR },
  /** Sign-in emails per client IP; the max comes from LOGIN_RATE_LIMIT_PER_IP. */
  loginIp: { name: "login:ip", max: 20, windowSeconds: HOUR },
  /** LLM-backed requests per user (onboarding, sentence edits, idea previews): protects spend. */
  llm: { name: "llm:user", max: 30, windowSeconds: HOUR },
  /** Interested / Pass answers per user, on top of the 15-a-day Interested cap. */
  answers: { name: "answer:user", max: 60, windowSeconds: HOUR },
  /** Ideas posted per user. */
  ideas: { name: "idea:user", max: 20, windowSeconds: DAY },
} as const satisfies Record<string, Limit>;

export function limitKey(limit: Limit, subject: string): string {
  return `${limit.name}:${subject.trim().toLowerCase()}`;
}

/**
 * The client's IP from proxy headers: the first `x-forwarded-for` entry (set
 * by Vercel), else `x-real-ip`, else "unknown" so every unknown client shares
 * one bucket rather than escaping the limit.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
