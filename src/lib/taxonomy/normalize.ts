import { TAXONOMY, TAXONOMY_GROUPS, type TaxonomyGroup } from "./skills";

/**
 * Maps free text onto canonical taxonomy slugs. Every LLM output and every
 * user tag edit passes through here; unknown tags are dropped.
 */

/** The form tags are compared in: lowercase, no spaces or punctuation (`+` and `#` kept for C++/C#). */
export function tagKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#]/g, "");
}

function buildIndex(group: TaxonomyGroup): Map<string, string> {
  const index = new Map<string, string>();
  for (const [slug, ...aliases] of TAXONOMY[group]) {
    for (const name of [slug, ...aliases]) index.set(tagKey(name), slug);
  }
  return index;
}

const INDEX = Object.fromEntries(
  TAXONOMY_GROUPS.map((group) => [group, buildIndex(group)]),
) as Record<TaxonomyGroup, Map<string, string>>;

/** Longest alias, in words; bounds the phrase length `findTags` has to try. */
const MAX_ALIAS_WORDS = Math.max(
  ...TAXONOMY_GROUPS.flatMap((group) =>
    TAXONOMY[group].flatMap((entry) => entry.map((name) => name.split(/[\s/-]+/).length)),
  ),
);

/** The canonical slug for one tag, or null when it is not in the taxonomy. */
export function normalizeTag(group: TaxonomyGroup, text: string): string | null {
  return INDEX[group].get(tagKey(text)) ?? null;
}

/** Canonical slugs for a list of tags: unknowns dropped, duplicates removed, order kept. */
export function normalizeTags(group: TaxonomyGroup, tags: readonly string[]): string[] {
  const slugs = new Set<string>();
  for (const tag of tags) {
    const slug = normalizeTag(group, tag);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/**
 * Finds taxonomy tags mentioned in prose, preferring the longest phrase
 * ("react native" is `react-native`, not `react`). `skip` lists alias keys to
 * ignore, for aliases that are also everyday words.
 */
export function findTags(
  group: TaxonomyGroup,
  text: string,
  skip: ReadonlySet<string> = new Set(),
): string[] {
  const index = INDEX[group];
  const words = text
    .split(/[\s/,;:()!?"|-]+/)
    .map(tagKey)
    .filter(Boolean);

  const slugs = new Set<string>();
  let i = 0;
  while (i < words.length) {
    let matched = 0;
    for (let n = Math.min(MAX_ALIAS_WORDS, words.length - i); n >= 1; n--) {
      const key = words.slice(i, i + n).join("");
      const slug = skip.has(key) ? undefined : index.get(key);
      if (slug) {
        slugs.add(slug);
        matched = n;
        break;
      }
    }
    i += matched || 1;
  }
  return [...slugs];
}
