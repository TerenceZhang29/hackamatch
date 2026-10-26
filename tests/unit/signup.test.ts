import { describe, expect, it } from "vitest";
import {
  answersSchema,
  areaChips,
  FEATURED_AREAS,
  FEATURED_SKILLS,
  searchByName,
  searchSkills,
  skillChips,
  splitSkills,
  suggestAreas,
} from "@/lib/signup";
import { displayLabel } from "@/lib/taxonomy/labels";
import { RELATED_DOMAINS, skillGroup, slugsOf } from "@/lib/taxonomy/skills";

const EVENT = "00000000-0000-4000-b000-000000000001";
const base = {
  firstName: "Maya",
  lastName: "",
  eventIds: [EVENT],
  domains: ["climate"],
  skills: ["ml"],
};

describe("taxonomy for sign-up", () => {
  it("relates every area, only to real areas, and never to itself", () => {
    const areas = slugsOf("domains");
    expect(Object.keys(RELATED_DOMAINS).sort()).toEqual([...areas].sort());
    for (const [area, related] of Object.entries(RELATED_DOMAINS)) {
      expect(related.length, area).toBeGreaterThan(0);
      for (const other of related) {
        expect(areas, `${area} → ${other}`).toContain(other);
        expect(other).not.toBe(area);
      }
    }
  });

  it("puts every featured skill in its own group", () => {
    for (const slug of FEATURED_SKILLS.technical) expect(skillGroup(slug)).toBe("technical");
    for (const slug of FEATURED_SKILLS.business) expect(skillGroup(slug)).toBe("business");
    expect(skillGroup("rust")).toBe("technical");
  });

  it("only features real slugs", () => {
    const skills = [...slugsOf("skills"), ...slugsOf("stack")];
    for (const slug of [...FEATURED_SKILLS.technical, ...FEATURED_SKILLS.business])
      expect(skills).toContain(slug);
    for (const slug of FEATURED_AREAS) expect(slugsOf("domains")).toContain(slug);
  });

  it("labels slugs the way people write them", () => {
    expect(displayLabel("edtech")).toBe("Education");
    expect(displayLabel("ux-design")).toBe("UX design");
    expect(displayLabel("nextjs")).toBe("Next.js");
    expect(displayLabel("mental-health")).toBe("Mental health");
  });
});

describe("searches", () => {
  it("matches any part of a name, every word, and nothing for an empty query", () => {
    const names = ["Cornell Tech Fall Hack", "Health AI Buildathon"];
    expect(searchByName(names, "fall", (n) => n)).toEqual(["Cornell Tech Fall Hack"]);
    expect(searchByName(names, "tech hack", (n) => n)).toEqual(["Cornell Tech Fall Hack"]);
    expect(searchByName(names, "  ", (n) => n)).toEqual([]);
    expect(searchByName(names, "rocket", (n) => n)).toEqual([]);
  });

  it("suggests matching areas first, then related ones", () => {
    expect(suggestAreas("space", [])).toEqual([
      { slug: "space", related: false },
      { slug: "manufacturing", related: true },
      { slug: "energy", related: true },
    ]);
    expect(suggestAreas("zzz", [])).toEqual([]);
  });

  it("with nothing typed, suggests areas related to the picks, leaving out picked ones", () => {
    const suggestions = suggestAreas("", ["climate", "energy"]).map((s) => s.slug);
    expect(suggestions).toContain("agriculture");
    expect(suggestions).not.toContain("climate");
    expect(suggestions).not.toContain("energy");
  });

  it("finds skills and tools by their display name", () => {
    expect(searchSkills("next")).toContain("nextjs");
    expect(searchSkills("machine")).toEqual(["ml"]);
  });

  it("adds picked skills and areas outside the featured chips to their group", () => {
    expect(skillChips(["rust", "sales"]).technical).toContain("rust");
    expect(skillChips(["rust", "sales"]).business).toContain("sales");
    expect(areaChips(["space"]).at(-1)).toBe("space");
  });

  it("splits picks into the profile's skills and stack", () => {
    expect(splitSkills(["ml", "rust", "pitching"])).toEqual({
      skills: ["ml", "pitching"],
      stack: ["rust"],
    });
  });
});

describe("answersSchema", () => {
  it("accepts valid answers and drops duplicates", () => {
    const parsed = answersSchema.parse({ ...base, eventIds: [EVENT, EVENT], skills: ["ml", "ml"] });
    expect(parsed.eventIds).toEqual([EVENT]);
    expect(parsed.skills).toEqual(["ml"]);
  });

  it("requires at least one skill and allows at most three", () => {
    expect(answersSchema.safeParse({ ...base, skills: [] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, skills: ["ml", "nlp", "ios", "rust"] }).success).toBe(
      false,
    );
  });

  it("requires one to five areas, all real", () => {
    expect(answersSchema.safeParse({ ...base, domains: [] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, domains: undefined }).success).toBe(false);
    const six = ["health", "climate", "fintech", "edtech", "civic", "media"];
    expect(answersSchema.safeParse({ ...base, domains: six }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, domains: ["rocketry"] }).success).toBe(false);
  });

  it("rejects free-text skills and hackathons", () => {
    expect(
      answersSchema.safeParse({ ...base, skills: ["underwater basket weaving"] }).success,
    ).toBe(false);
    expect(answersSchema.safeParse({ ...base, eventIds: ["my-hackathon"] }).success).toBe(false);
  });

  it("takes events or Undecided, not both and not neither", () => {
    expect(answersSchema.safeParse({ ...base, undecided: true }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, eventIds: [], undecided: true }).success).toBe(true);
    expect(answersSchema.safeParse({ ...base, eventIds: [] }).success).toBe(false);
    expect(answersSchema.safeParse({ ...base, eventIds: [], undecided: false }).success).toBe(
      false,
    );
  });

  it("requires a first name", () => {
    expect(answersSchema.safeParse({ ...base, firstName: " " }).success).toBe(false);
  });
});
