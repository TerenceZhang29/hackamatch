import { findTags } from "@/lib/taxonomy/normalize";
import { IDEA_TOOL, PROFILE_TOOL } from "./prompts";
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

function firstWords(text: string, count: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function fakeIdea(text: string) {
  let scope: "weekend" | "few_weeks" | "ongoing" = "few_weeks";
  if (/\b(hackathon|weekend|48 hours|demo)\b/i.test(text)) scope = "weekend";
  else if (/\b(startup|company|co-?founder|long[- ]term|business)\b/i.test(text)) scope = "ongoing";

  return {
    pitch: firstWords(text, 20),
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
        /\b(app|platform|tool|website|marketplace|bot|service|idea|want to build|that helps)\b/i.test(
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

export const fakeLlm: LlmClient = {
  async structured<T>(request: StructuredRequest<T>): Promise<T> {
    let output: unknown;
    if (request.toolName === PROFILE_TOOL) output = fakeProfile(request.user);
    else if (request.toolName === IDEA_TOOL) output = fakeIdea(readTag(request.user, "idea"));
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
