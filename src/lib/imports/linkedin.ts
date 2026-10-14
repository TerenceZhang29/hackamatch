/**
 * LinkedIn's API is closed to apps like this one, so HackaMatch never fetches
 * LinkedIn. The user may give their profile URL (stored as given, shown to
 * matches) and paste their About or Experience text (used for tagging).
 */

export const LINKEDIN_TEXT_MAX = 3_000;

/** The canonical `https://www.linkedin.com/in/<handle>` form of a profile URL, or null. */
export function normalizeLinkedinUrl(input: string): string | null {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const match = /^\/in\/([A-Za-z0-9\-_%]{3,100})\/?$/.exec(url.pathname);
  return match ? `https://www.linkedin.com/in/${match[1]}` : null;
}

/** Trims pasted LinkedIn text and caps its length. Empty text is null. */
export function cleanLinkedinText(text: string): string | null {
  const cleaned = text.replaceAll(/\s+\n/g, "\n").trim().slice(0, LINKEDIN_TEXT_MAX).trim();
  return cleaned || null;
}
