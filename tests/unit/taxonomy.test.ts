import { describe, expect, it } from "vitest";
import { findTags, normalizeTag, normalizeTags, tagKey } from "@/lib/taxonomy/normalize";
import { slugsOf, TAXONOMY, TAXONOMY_GROUPS } from "@/lib/taxonomy/skills";

describe("taxonomy", () => {
  it("has about 150 canonical slugs", () => {
    const total = TAXONOMY_GROUPS.reduce((sum, group) => sum + slugsOf(group).length, 0);
    expect(total).toBeGreaterThanOrEqual(140);
    expect(total).toBeLessThanOrEqual(200);
  });

  it.each(TAXONOMY_GROUPS)("%s: slugs are kebab-case and unique", (group) => {
    const slugs = slugsOf(group);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(TAXONOMY_GROUPS)("%s: no alias points at two slugs", (group) => {
    const owner = new Map<string, string>();
    for (const [slug, ...aliases] of TAXONOMY[group]) {
      for (const name of [slug, ...aliases]) {
        const key = tagKey(name);
        expect(key, `"${name}" has no comparable form`).not.toBe("");
        expect(owner.get(key) ?? slug, `"${name}" is claimed twice`).toBe(slug);
        owner.set(key, slug);
      }
    }
  });
});

describe("normalizeTag", () => {
  it("maps a slug to itself", () => {
    expect(normalizeTag("skills", "data-analysis")).toBe("data-analysis");
  });

  it("ignores case, spacing and punctuation", () => {
    expect(normalizeTag("stack", "Node.js")).toBe("nodejs");
    expect(normalizeTag("stack", " next JS ")).toBe("nextjs");
    expect(normalizeTag("skills", "Machine Learning")).toBe("ml");
    expect(normalizeTag("stack", "HTML/CSS")).toBe("html-css");
  });

  it("keeps + and # so C, C++ and C# stay distinct", () => {
    expect(normalizeTag("stack", "C")).toBe("c");
    expect(normalizeTag("stack", "C++")).toBe("cpp");
    expect(normalizeTag("stack", "C#")).toBe("csharp");
  });

  it("looks only in the given group", () => {
    expect(normalizeTag("domains", "health")).toBe("health");
    expect(normalizeTag("stack", "health")).toBeNull();
  });

  it("returns null for unknown or empty tags", () => {
    expect(normalizeTag("skills", "underwater basket weaving")).toBeNull();
    expect(normalizeTag("skills", "")).toBeNull();
    expect(normalizeTag("skills", "!!!")).toBeNull();
  });
});

describe("normalizeTags", () => {
  it("drops unknowns, removes duplicates and keeps order", () => {
    expect(normalizeTags("stack", ["Python", "made-up", "react", "ReactJS", "py"])).toEqual([
      "python",
      "react",
    ]);
  });
});

describe("findTags", () => {
  it("finds tags in prose", () => {
    const text = "I build React and Python apps, mostly health stuff";
    expect(findTags("stack", text)).toEqual(["react", "python"]);
    expect(findTags("domains", text)).toEqual(["health"]);
  });

  it("prefers the longest phrase", () => {
    expect(findTags("stack", "shipped two React Native apps")).toEqual(["react-native"]);
    expect(findTags("skills", "I do machine learning.")).toEqual(["ml"]);
  });

  it("splits on slashes and handles trailing punctuation", () => {
    expect(findTags("stack", "Python/TypeScript, Node.js.")).toEqual([
      "python",
      "typescript",
      "nodejs",
    ]);
  });

  it("skips the alias keys it is told to", () => {
    expect(findTags("stack", "I want to go build in Rust")).toEqual(["go", "rust"]);
    expect(findTags("stack", "I want to go build in Rust", new Set(["go"]))).toEqual(["rust"]);
  });
});
