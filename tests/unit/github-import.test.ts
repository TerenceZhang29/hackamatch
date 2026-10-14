import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildGithubSummary,
  fetchGithubSummary,
  parseGithubUsername,
  SUMMARY_MAX,
} from "@/lib/imports/github";

vi.mock("@/lib/config", () => ({ getConfig: () => ({ LLM_PROVIDER: "fake" }) }));

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../fixtures/github/${name}.json`, import.meta.url), "utf8"));
const user = fixture("user");
const repos = fixture("repos");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch that answers the two GitHub endpoints from the recorded fixtures. */
function fixtureFetch() {
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    return path.endsWith("/repos") ? jsonResponse(repos) : jsonResponse(user);
  });
}

describe("parseGithubUsername", () => {
  it.each([
    ["https://github.com/sofia-chen-dev", "sofia-chen-dev"],
    ["github.com/sofia-chen-dev/", "sofia-chen-dev"],
    ["http://www.github.com/Octocat", "Octocat"],
    ["  https://github.com/a1  ", "a1"],
  ])("reads %s", (input, expected) => {
    expect(parseGithubUsername(input)).toBe(expected);
  });

  it.each([
    "https://github.com/sofia-chen-dev/clinic-queue",
    "https://gitlab.com/sofia",
    "https://github.com.evil.com/sofia",
    "https://github.com/",
    "https://github.com/-bad-",
    "https://github.com/sofia?tab=repos",
    "https://user:pass@github.com/sofia",
    "not a url",
    "",
  ])("rejects %s", (input) => {
    expect(parseGithubUsername(input)).toBeNull();
  });
});

describe("buildGithubSummary", () => {
  it("summarizes languages, topics and recent repositories, skipping forks", () => {
    const summary = buildGithubSummary(user, repos);
    expect(summary).toMatchObject({
      username: "sofia-chen-dev",
      name: "Sofia Chen",
      bio: "Frontend engineer. I like health tech.",
    });
    expect(summary.summaryText).toBe(
      [
        "Bio: Frontend engineer. I like health tech.",
        "Languages: TypeScript, Python, Shell",
        "Topics: health, nextjs, react, react-native, data-analysis, pandas, tailwind",
        "Recent repositories: clinic-queue (Next.js app that shows clinic wait times); med-reminders (React Native medication reminders); sleep-data (Pandas notebooks on sleep tracker exports); dotfiles; portfolio (Personal site built with Tailwind)",
      ].join("\n"),
    );
    expect(summary.summaryText).not.toContain("A fork of React");
  });

  it("caps the summary length", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `repo-${i}`,
      description: "x".repeat(400),
      language: "Rust",
      fork: false,
      pushed_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    expect(buildGithubSummary(user, many).summaryText.length).toBeLessThanOrEqual(SUMMARY_MAX);
  });

  it("handles an empty profile", () => {
    const summary = buildGithubSummary({ login: "empty", name: null, bio: null }, []);
    expect(summary).toEqual({ username: "empty", name: null, bio: null, summaryText: "" });
  });
});

describe("fetchGithubSummary", () => {
  it("fetches the user and their recently updated repositories", async () => {
    const fetchImpl = fixtureFetch();
    const summary = await fetchGithubSummary("github.com/sofia-chen-dev", {
      fetchImpl,
      token: "ghp_test",
    });
    expect(summary?.summaryText).toContain("Languages: TypeScript");
    const urls = fetchImpl.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      "https://api.github.com/users/sofia-chen-dev",
      "https://api.github.com/users/sofia-chen-dev/repos?sort=updated&per_page=30",
    ]);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
  });

  it("returns null without fetching for a URL that is not a profile", async () => {
    const fetchImpl = fixtureFetch();
    expect(await fetchGithubSummary("https://example.com/sofia", { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null for a missing user or a rate limit", async () => {
    for (const status of [404, 403, 429]) {
      const fetchImpl = vi.fn(async () => jsonResponse({ message: "nope" }, status));
      expect(await fetchGithubSummary("github.com/ghost", { fetchImpl })).toBeNull();
    }
  });

  it("returns null when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchGithubSummary("github.com/sofia", { fetchImpl })).toBeNull();
  });
});

describe("GitHub import with an empty sentence", () => {
  it("still produces stack tags (fake LLM, recorded GitHub responses)", async () => {
    const { extractProfile } = await import("@/lib/llm/extract-profile");
    const summary = await fetchGithubSummary("github.com/sofia-chen-dev", {
      fetchImpl: fixtureFetch(),
    });
    const profile = await extractProfile({
      role: "builder",
      sentence: summary!.bio ?? "(imported from GitHub)",
      githubSummary: summary!.summaryText,
    });
    expect(profile.stack.length).toBeGreaterThan(0);
    expect(profile.stack).toEqual(expect.arrayContaining(["typescript", "python", "nextjs"]));
  });
});
