/**
 * Reads a public GitHub profile into a short text the LLM can tag. Only public
 * data, and never required: any failure returns null so onboarding goes on.
 */

const API = "https://api.github.com";
const TIMEOUT_MS = 5_000;
export const SUMMARY_MAX = 1_500;

// GitHub usernames: alphanumerics and single hyphens, no leading/trailing hyphen, up to 39 chars.
const USERNAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/**
 * The username in a GitHub profile URL (`github.com/<user>`, with or without
 * scheme, `www.` or a trailing slash), or null for anything else, including
 * repository URLs and other hosts.
 */
export function parseGithubUsername(input: string): string | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return null;
  if (url.search || url.hash || url.username || url.password || url.port) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  const username = parts[0]!;
  return USERNAME.test(username) ? username : null;
}

interface GithubUser {
  login: string;
  name: string | null;
  bio: string | null;
}

interface GithubRepo {
  name: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  fork: boolean;
  pushed_at: string | null;
}

export interface GithubSummary {
  username: string;
  name: string | null;
  bio: string | null;
  /** Languages, topics and recent repositories, at most SUMMARY_MAX characters. */
  summaryText: string;
}

/** Counts values and returns the most common first (ties keep first-seen order). */
function topCounts(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

/** Builds the summary text from API responses. Pure, so tests can use recorded fixtures. */
export function buildGithubSummary(user: GithubUser, repos: GithubRepo[]): GithubSummary {
  const own = repos.filter((repo) => !repo.fork);
  const languages = topCounts(
    own.map((repo) => repo.language).filter((l): l is string => Boolean(l)),
    8,
  );
  const topics = topCounts(
    own.flatMap((repo) => repo.topics ?? []),
    10,
  );
  const recent = own
    .toSorted((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, 5)
    .map((repo) => (repo.description ? `${repo.name} (${repo.description.trim()})` : repo.name));

  const lines = [
    user.bio?.trim() ? `Bio: ${user.bio.trim()}` : null,
    languages.length ? `Languages: ${languages.join(", ")}` : null,
    topics.length ? `Topics: ${topics.join(", ")}` : null,
    recent.length ? `Recent repositories: ${recent.join("; ")}` : null,
  ].filter((line): line is string => line !== null);

  let summaryText = lines.join("\n");
  if (summaryText.length > SUMMARY_MAX) summaryText = `${summaryText.slice(0, SUMMARY_MAX - 1)}…`;

  return {
    username: user.login,
    name: user.name?.trim() || null,
    bio: user.bio?.trim() || null,
    summaryText,
  };
}

/**
 * Fetches a GitHub profile and its 30 most recently updated repositories.
 * Returns null on a bad URL, a missing user, a rate limit, a timeout or any
 * other failure.
 */
export async function fetchGithubSummary(
  profileUrl: string,
  options: { token?: string; fetchImpl?: typeof fetch } = {},
): Promise<GithubSummary | null> {
  const username = parseGithubUsername(profileUrl);
  if (!username) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "HackaMatch",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    const [userResponse, reposResponse] = await Promise.all([
      fetchImpl(`${API}/users/${username}`, { headers, signal }),
      fetchImpl(`${API}/users/${username}/repos?sort=updated&per_page=30`, { headers, signal }),
    ]);
    if (!userResponse.ok || !reposResponse.ok) {
      console.warn("GitHub import failed", username, userResponse.status, reposResponse.status);
      return null;
    }
    const user = (await userResponse.json()) as GithubUser;
    const repos = (await reposResponse.json()) as GithubRepo[];
    if (!Array.isArray(repos)) return null;
    return buildGithubSummary(user, repos);
  } catch (error) {
    console.warn("GitHub import failed", username, error);
    return null;
  }
}
