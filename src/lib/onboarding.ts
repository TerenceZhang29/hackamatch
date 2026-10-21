import { normalizeTags } from "@/lib/taxonomy/normalize";

/**
 * The sign-up routes (P1-22, owner 2026-10-21): each person joins either with
 * an idea or as a builder. The idea route needs an idea found in their
 * sentence; the builder route needs a skill. Pure, so the review step and
 * joinPool agree.
 */

export type OnboardingRole = "idea" | "builder" | "both";

/** The two routes offered at sign-up. "both" is only for older pages mid-sign-up. */
export type SignupRoute = "idea" | "builder";

/** Common skills offered as one-tap picks on the builder route. Slugs from the skills taxonomy. */
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

export type BlockReason = "no-idea" | "no-skill" | "pending-idea" | "pending-builder";

export const BLOCK_MESSAGES: Record<BlockReason, string> = {
  "no-idea": "We couldn't find an idea in your sentence. Describe what you want to build.",
  "no-skill": "Add at least one skill to join.",
  "pending-idea": "Still reading your idea…",
  "pending-builder": "Still reading your sentence. Pick a skill to join now, or check again.",
};

export type OnboardingOutcome =
  { ok: true; role: OnboardingRole } | { ok: false; reason: BlockReason };

/**
 * Whether someone can join, and as what.
 * - `extracted`: the AI has read their current sentence (false while it's
 *   slow or after it failed).
 * - `hasIdea`: an open idea came out of it (a builder's draft doesn't count).
 * - `tags`: the tags they're submitting, including quick picks.
 */
export function onboardingOutcome(
  role: OnboardingRole,
  state: {
    extracted: boolean;
    hasIdea: boolean;
    tags: { skills: readonly string[]; stack: readonly string[] };
  },
): OnboardingOutcome {
  const skill = hasSkill(state.tags);
  if (role === "idea") {
    if (!state.extracted) return { ok: false, reason: "pending-idea" };
    return state.hasIdea ? { ok: true, role: "idea" } : { ok: false, reason: "no-idea" };
  }
  if (role === "builder") {
    if (skill) return { ok: true, role: "builder" };
    return { ok: false, reason: state.extracted ? "no-skill" : "pending-builder" };
  }
  // "both", from a page loaded before P1-22: P1-21's rule, an idea or a skill.
  if (!state.extracted) return { ok: true, role: "both" };
  if (state.hasIdea) return { ok: true, role: "both" };
  return skill ? { ok: true, role: "builder" } : { ok: false, reason: "no-skill" };
}
