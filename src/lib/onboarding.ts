import { normalizeTags } from "@/lib/taxonomy/normalize";

/**
 * The sign-up rule (P1-21, owner 2026-10-21): everyone joins with an idea or
 * a skill. Someone whose text gave no idea joins as a builder; with no idea
 * and no skill, joining is blocked. Pure, so the review step and joinPool
 * agree.
 */

export type OnboardingRole = "idea" | "builder" | "both";

export const IDEA_OR_SKILL_REQUIRED = "Add a skill, or go back and describe your idea, to join.";

/** Common skills offered as one-tap picks at sign-up. Slugs from the skills taxonomy. */
export const QUICK_SKILLS = [
  "frontend",
  "backend",
  "fullstack",
  "mobile",
  "ml",
  "data-science",
  "ux-design",
  "product-management",
  "hardware",
  "business-development",
] as const;

/** A skill is a skills or stack tag that's in the taxonomy; areas alone don't count. */
export function hasSkill(tags: { skills: readonly string[]; stack: readonly string[] }): boolean {
  return (
    normalizeTags("skills", tags.skills).length + normalizeTags("stack", tags.stack).length > 0
  );
}

export type OnboardingOutcome = { ok: true; role: OnboardingRole } | { ok: false };

export function onboardingOutcome(
  role: OnboardingRole,
  hasIdea: boolean,
  tags: { skills: readonly string[]; stack: readonly string[] },
): OnboardingOutcome {
  if (!hasIdea && !hasSkill(tags)) return { ok: false };
  return { ok: true, role: hasIdea ? role : "builder" };
}
