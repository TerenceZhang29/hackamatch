/**
 * Guards against two extraction failures seen in production (P1-21): a
 * placeholder sentence ("I want to build a xxx") turned into an idea, and
 * the model writing notes about the input ("the text names no product")
 * where public text belongs. Pure, so the fake provider and tests share them.
 */

/** Words that say "I want to build" without saying what. */
const FILLER = new Set([
  "i",
  "im",
  "i'm",
  "we",
  "want",
  "wants",
  "wanna",
  "would",
  "like",
  "to",
  "build",
  "make",
  "create",
  "do",
  "work",
  "on",
  "a",
  "an",
  "the",
  "some",
  "my",
  "our",
  "new",
  "cool",
  "fun",
  "app",
  "apps",
  "thing",
  "things",
  "project",
  "projects",
  "product",
  "idea",
  "ideas",
  "something",
  "stuff",
  "startup",
  "and",
  "or",
  "for",
  "with",
  "that",
  "it",
  "this",
]);

/** Stand-ins for a real description. */
const PLACEHOLDER = /^(x+|y+|z+|tbd|todo|tba|na|n\/a|etc|blah|foo|bar|asdf|test|abc|\?+|\.+|-+)$/;

/**
 * True when the text describes nothing: once filler words and placeholder
 * tokens ("xxx", "tbd", "...") are removed, nothing is left.
 */
export function isPlaceholderText(text: string): boolean {
  const words = text
    .toLowerCase()
    .split(/[\s,;:!.]+/)
    .map((word) => word.replace(/^[^a-z0-9?.-]+|[^a-z0-9?.-]+$/g, ""))
    .filter(Boolean);
  return words.every((word) => FILLER.has(word) || PLACEHOLDER.test(word) || /^(.)\1+$/.test(word));
}

/** Phrases that talk about the input or what it lacks, not about the person or idea. */
const META = [
  /\bthe (text|input|sentence|description|message)\b/i,
  /\bnames? no\b/i,
  /\b(has|have)n['’]?t (yet )?(described|said|specified|named|shared|given)\b/i,
  /\bnot (yet )?(been )?(described|specified|stated|provided|given|named)\b/i,
  /\bno (specific |clear |concrete )?(product|problem|user|users|details?|idea|skills?)( or [a-z]+)* (is |are )?(named|stated|given|described|mentioned|provided)\b/i,
  /\bno (personal )?skills stated\b/i,
  /\bunspecified\b/i,
  /\bdoes not (say|describe|name|specify|mention)\b/i,
];

/** True when model output is a note about the input rather than content. */
export function isMetaText(text: string): boolean {
  return META.some((pattern) => pattern.test(text));
}

/**
 * A plain summary from what is known, used when the model's summary is a
 * note about the input. Null when there's nothing to say yet.
 */
export function neutralSummary(
  role: "idea" | "builder" | "both",
  hasIdea: boolean,
  tags: { skills: readonly string[]; stack: readonly string[]; domains: readonly string[] },
  label: (slug: string) => string,
): string | null {
  const tools = [...tags.stack, ...tags.skills].slice(0, 3).map(label);
  const areas = tags.domains.slice(0, 2).map(label);
  if (!tools.length && !areas.length) return null;
  const who =
    !hasIdea || role === "builder"
      ? "Builds"
      : role === "idea"
        ? "Has an idea"
        : "Builds and has ideas";
  return [
    who,
    tools.length ? `with ${tools.join(", ")}` : "",
    areas.length ? `in ${areas.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
