import { findTags } from "@/lib/taxonomy/normalize";
import { COFFEE_CHAT_TOOL, IDEA_TOOL, PROFILE_TOOL } from "./prompts";
import { LlmError, type LlmClient, type StructuredRequest } from "./types";

/**
 * Deterministic stand-in for Claude (`LLM_PROVIDER=fake`): keyword rules over
 * the taxonomy aliases, no network. It reads the same user prompts the real
 * model gets and its output goes through the same schema, so tests and local
 * dev exercise the real code path.
 */

/** Aliases that are also everyday words; too noisy to match in prose. */
const PROSE_SKIP = new Set(["go", "r", "c", "net", "next", "node", "express", "spring", "excel"]);

function readTag(prompt: string, tag: string): string {
  return prompt.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? "";
}

/** Words a cut pitch shouldn't end on ("…with", "…and the"). */
const DANGLING = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "which",
  "who",
  "with",
  "building",
  "using",
  "until",
  "so",
  "because",
  "when",
  "where",
]);

/**
 * A pitch like the real model's: the first sentence, at most `max` words. A
 * longer one stops at a natural break (a comma, or before a dangling word like
 * "and") and ends with "…", so local cards don't stop mid-phrase.
 */
export function fakePitch(text: string, max = 20): string {
  const sentence = text.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  const words = sentence.split(/\s+/).filter(Boolean);
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (words.length <= max) return capitalize(words.join(" "));

  let cut = words.slice(0, max);
  const comma = cut.findLastIndex((w) => w.endsWith(","));
  // Stop at a comma when it still leaves a meaningful pitch (6+ words).
  if (comma >= 5) cut = cut.slice(0, comma + 1);
  while (
    cut.length > 1 &&
    DANGLING.has(
      cut
        .at(-1)!
        .toLowerCase()
        .replace(/[,;:]$/, ""),
    )
  ) {
    cut = cut.slice(0, -1);
  }
  return `${capitalize(cut.join(" ").replace(/[,;:]$/, ""))}…`;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function fakeIdea(text: string) {
  let scope: "weekend" | "few_weeks" | "ongoing" = "few_weeks";
  if (/\b(hackathon|weekend|48 hours|demo)\b/i.test(text)) scope = "weekend";
  else if (/\b(startup|company|co-?founder|long[- ]term|business)\b/i.test(text)) scope = "ongoing";

  return {
    pitch: fakePitch(text),
    domain: findTags("domains", text, PROSE_SKIP)[0] ?? null,
    skills_needed: findTags("skills", text, PROSE_SKIP),
    scope,
    // A very short idea is missing detail; ask for the most useful one.
    clarifying_question: wordCount(text) < 8 ? "Who is this for?" : null,
  };
}

function fakeProfile(prompt: string) {
  const role = readTag(prompt, "role");
  const sentence = readTag(prompt, "sentence");
  const text = [sentence, readTag(prompt, "github"), readTag(prompt, "linkedin")].join(" ");

  const skills = findTags("skills", text, PROSE_SKIP);
  const stack = findTags("stack", text, PROSE_SKIP);
  const domains = findTags("domains", text, PROSE_SKIP);

  let experience_level: "beginner" | "intermediate" | "advanced" = "intermediate";
  if (/\b(beginner|new to|first time|just started|learning to)\b/i.test(text)) {
    experience_level = "beginner";
  } else if (/\b(senior|expert|advanced|\d+\+? years|shipped|in production)\b/i.test(text)) {
    experience_level = "advanced";
  }

  const who = role === "idea" ? "Has an idea" : role === "both" ? "Builds and has ideas" : "Builds";
  const tools = [...stack, ...skills].slice(0, 3);
  const summary = [
    who,
    tools.length ? `with ${tools.join(", ")}` : "",
    domains.length ? `in ${domains.slice(0, 2).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const describesProduct =
    role === "idea"
      ? wordCount(sentence) >= 3
      : role === "both" &&
        /\b(app|platform|tool|website|site|marketplace|bot|chatbot|service|dashboard|extension|network|map|game|plugin|idea|want to build|that helps)\b/i.test(
          sentence,
        );

  return {
    summary,
    skills,
    stack,
    domains,
    experience_level,
    idea: describesProduct ? fakeIdea(sentence) : null,
  };
}

function fakeCoffeeChat(prompt: string) {
  const recipient = readTag(prompt, "recipient");
  const idea = readTag(prompt, "idea").replace(/[.!?]+$/, "");
  const about = idea ? ` about ${idea.charAt(0).toLowerCase()}${idea.slice(1)}` : "";
  return {
    message: `Hi ${recipient}, HackaMatch paired us and I'd love to chat${about}. Free for a 15-minute coffee at Cornell Tech this week?`,
  };
}

/**
 * Test hook: a prompt containing `[[fake-llm-delay-ms=N]]` makes the fake
 * wait N ms, failing like a timeout if that exceeds the request's deadline.
 * Lets e2e tests exercise the slow-LLM paths without a real provider.
 */
async function simulateDelay(prompt: string, timeoutMs: number | undefined) {
  const delay = Number(/\[\[fake-llm-delay-ms=(\d+)\]\]/.exec(prompt)?.[1] ?? 0);
  if (!delay) return;
  const deadline = timeoutMs ?? Number.POSITIVE_INFINITY;
  await new Promise((resolve) => setTimeout(resolve, Math.min(delay, deadline)));
  if (delay > deadline) throw new LlmError("LLM request timed out");
}

export const fakeLlm: LlmClient = {
  async structured<T>(request: StructuredRequest<T>): Promise<T> {
    await simulateDelay(request.user, request.timeoutMs);
    let output: unknown;
    if (request.toolName === PROFILE_TOOL) output = fakeProfile(request.user);
    else if (request.toolName === IDEA_TOOL) output = fakeIdea(readTag(request.user, "idea"));
    else if (request.toolName === COFFEE_CHAT_TOOL) output = fakeCoffeeChat(request.user);
    else throw new LlmError(`The fake LLM has no rule for tool "${request.toolName}"`);

    const parsed = request.schema.safeParse(output);
    if (!parsed.success) {
      throw new LlmError(`The fake LLM produced invalid output for "${request.toolName}"`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  },
};
