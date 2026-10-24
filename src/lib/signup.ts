import { z } from "zod";
import { nameFields } from "@/app/(focus)/onboarding/schema";
import { displayLabel } from "@/lib/taxonomy/labels";
import { RELATED_DOMAINS, skillGroup, slugsOf, type SkillGroup } from "@/lib/taxonomy/skills";

/** Sign-up in four steps, email last (P1-24, docs/plans/p1-24-redesign.md). Pure helpers and schemas. */

export const MAX_AREAS = 5;
export const MAX_SKILLS = 3;
/** How long the answers wait for the magic link to be clicked. */
export const PENDING_HOURS = 48;

/** The popular areas shown as chips on step 2; the rest are found by searching. */
export const FEATURED_AREAS = [
  "health",
  "climate",
  "fintech",
  "edtech",
  "civic",
  "ai-tools",
  "nonprofit",
  "devtools",
  "accessibility",
  "campus-life",
  "creator-tools",
  "media",
] as const;

/** The skills shown as chips on step 3, by group; the rest are found by searching. */
export const FEATURED_SKILLS: Readonly<Record<SkillGroup, readonly string[]>> = {
  technical: [
    "frontend",
    "backend",
    "fullstack",
    "mobile",
    "ml",
    "llm-apps",
    "data-science",
    "hardware",
  ],
  business: [
    "ux-design",
    "product-management",
    "pitching",
    "business-development",
    "marketing",
    "fundraising",
  ],
};

const AREAS = slugsOf("domains");
const SKILLS = [...slugsOf("skills"), ...slugsOf("stack")];
const AREA_SET = new Set(AREAS);
const SKILL_SET = new Set(SKILLS);

/** True when every word of the query is found in the label (case-insensitive). */
function matches(label: string, query: string): boolean {
  const name = label.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => name.includes(word));
}

/** Supported names whose label matches the query, in their own order. An empty query finds nothing. */
export function searchByName<T>(
  items: readonly T[],
  query: string,
  label: (item: T) => string,
): T[] {
  return query.trim() ? items.filter((item) => matches(label(item), query)) : [];
}

export interface AreaSuggestion {
  slug: string;
  /** Offered because it's related to a match or a pick, not because its name matched. */
  related: boolean;
}

/**
 * Step 2's search: the areas whose name matches, then the areas related to
 * them. With nothing typed, the areas related to the ones already picked.
 */
export function suggestAreas(
  query: string,
  picked: readonly string[],
  limit = 8,
): AreaSuggestion[] {
  const found = searchByName(AREAS, query, displayLabel);
  const seeds = query.trim() ? found : picked;
  const related: string[] = [];
  for (const slug of seeds) {
    for (const other of RELATED_DOMAINS[slug] ?? []) {
      if (found.includes(other) || related.includes(other)) continue;
      if (!query.trim() && picked.includes(other)) continue;
      related.push(other);
    }
  }
  return [
    ...found.map((slug) => ({ slug, related: false })),
    ...related.map((slug) => ({ slug, related: true })),
  ].slice(0, limit);
}

/** Step 3's search over every supported skill and tool. */
export function searchSkills(query: string, limit = 8): string[] {
  return searchByName(SKILLS, query, displayLabel).slice(0, limit);
}

/** The skills chips, by group: the featured ones plus any other picked skill, in its group. */
export function skillChips(picked: readonly string[]): Record<SkillGroup, string[]> {
  const chips: Record<SkillGroup, string[]> = {
    technical: [...FEATURED_SKILLS.technical],
    business: [...FEATURED_SKILLS.business],
  };
  for (const slug of picked) {
    const group = skillGroup(slug);
    if (!chips[group].includes(slug)) chips[group].push(slug);
  }
  return chips;
}

/** The area chips: the featured ones plus any other picked area. */
export function areaChips(picked: readonly string[]): string[] {
  return [
    ...FEATURED_AREAS,
    ...picked.filter((slug) => !(FEATURED_AREAS as readonly string[]).includes(slug)),
  ];
}

const unique = <T>(values: T[]) => [...new Set(values)];

/** Step 1: events (ids) or "undecided", never both. */
export const hackathonsSchema = z
  .object({
    eventIds: z.array(z.uuid()).max(20).default([]).transform(unique),
    undecided: z.boolean().default(false),
  })
  .refine((value) => !(value.undecided && value.eventIds.length > 0), {
    message: "Pick hackathons or Undecided, not both",
    path: ["undecided"],
  });

/** Step 2: up to 5 supported areas. */
export const areasSchema = z.object({
  domains: z
    .array(z.string().refine((slug) => AREA_SET.has(slug), "Unknown area"))
    .max(MAX_AREAS, `Pick up to ${MAX_AREAS}`)
    .default([])
    .transform(unique),
});

/** Step 3: 1 to 3 supported skills (owner, 2026-10-23: at least one is required). */
export const skillsSchema = z.object({
  skills: z
    .array(z.string().refine((slug) => SKILL_SET.has(slug), "Unknown skill"))
    .transform(unique)
    .pipe(
      z
        .array(z.string())
        .min(1, "Pick at least one skill")
        .max(MAX_SKILLS, `Pick up to ${MAX_SKILLS}`),
    ),
});

/** Steps 1 to 3, the answers kept until the email is confirmed. */
export const answersSchema = z
  .object({ ...nameFields })
  .and(hackathonsSchema)
  .and(areasSchema)
  .and(skillsSchema);

export type SignupAnswers = z.infer<typeof answersSchema>;

/** Splits the picked skills into the profile's `skills` and `stack` columns. */
export function splitSkills(picked: readonly string[]): { skills: string[]; stack: string[] } {
  const stack = new Set(slugsOf("stack"));
  return {
    skills: picked.filter((slug) => !stack.has(slug)),
    stack: picked.filter((slug) => stack.has(slug)),
  };
}
