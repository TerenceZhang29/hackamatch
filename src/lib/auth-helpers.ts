/**
 * Pure auth helpers shared by the login action, the auth callback and the
 * middleware. No server-only imports, so they run in any runtime and are easy
 * to unit test.
 */

/** Routes that require a signed-in user. Enforced in src/middleware.ts. */
const PROTECTED_PREFIXES = ["/me", "/matches", "/ideas/new", "/organizer", "/admin"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Only used to resolve relative paths; never appears in a result.
const PLACEHOLDER_ORIGIN = "http://internal.invalid";

/**
 * Returns `next` as a same-site relative path (`/path?query#hash`), or null
 * when it could send the user to another site. Auth routes are rejected too,
 * so a login can never loop back into itself.
 */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  // `//host` and `/\host` are treated as absolute URLs by browsers.
  if (next.startsWith("//") || next.includes("\\")) return null;
  // Control characters (tabs, newlines) are stripped by URL parsers, which
  // could turn `/\t/host` into `//host`.
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;

  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  if (url.pathname.startsWith("//")) return null;

  const { pathname } = url;
  if (pathname === "/login" || pathname === "/logout" || pathname.startsWith("/auth/")) {
    return null;
  }
  return `${pathname}${url.search}${url.hash}`;
}

/** `/login`, carrying a safe `next` so the user returns where they started. */
export function loginPath(next?: string | null): string {
  const safe = sanitizeNext(next);
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

/** Trims and lowercases, so the same person never gets two accounts. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * True when the email's domain is exactly one of `allowedDomains`. Subdomains
 * are not implied, matching the database trigger `enforce_email_domain`.
 */
export function isAllowedEmailDomain(email: string, allowedDomains: readonly string[]): boolean {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = normalized.slice(at + 1);
  return allowedDomains.some((allowed) => allowed.trim().toLowerCase() === domain);
}
