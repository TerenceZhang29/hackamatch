import { z } from "zod";
import { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS, MAX_ATTEMPTS, describeIssues } from "./shared";
import { LlmError, type LlmClient, type StructuredRequest } from "./types";

const INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Gemini counts thinking tokens against `max_output_tokens`, and how much a
 * model thinks by default differs per model, so leave room on top of the
 * answer itself.
 */
const THINKING_HEADROOM_TOKENS = 2048;

/** The JSON Schema keywords Gemini's structured output documents as supported. */
const SUPPORTED_KEYWORDS = new Set([
  "type",
  "title",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
]);

type JsonSchema = { [key: string]: unknown };

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Rewrites a JSON Schema into the subset Gemini accepts: a nullable value is
 * a type list (`["string", "null"]`) instead of `anyOf`, and keywords outside
 * the supported set are dropped. Dropped constraints are still enforced,
 * because the output is validated against the zod schema afterwards.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!isObject(schema)) return schema;

  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.filter(isObject);
    const rest = branches.filter((branch) => branch.type !== "null");
    const only = rest[0];
    if (rest.length !== 1 || rest.length === branches.length || typeof only?.type !== "string") {
      throw new LlmError("The Gemini provider supports anyOf only for nullable values");
    }
    return toGeminiSchema({ ...only, type: [only.type, "null"] });
  }

  const result: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "properties" && isObject(value)) {
      result.properties = Object.fromEntries(
        Object.entries(value).map(([name, property]) => [name, toGeminiSchema(property)]),
      );
    } else if (key === "items" || key === "prefixItems" || key === "additionalProperties") {
      result[key] = toGeminiSchema(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

interface Interaction {
  status?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
}

function outputText(interaction: Interaction): string {
  return (interaction.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

/**
 * Gemini implementation, over the Interactions API: structured output through
 * a JSON response format built from the zod schema. `store: false` keeps the
 * request stateless, so Google does not keep the interaction for retrieval.
 */
export function createGeminiLlm(options: GeminiOptions): LlmClient {
  const send = options.fetch ?? fetch;

  return {
    async structured<T>(request: StructuredRequest<T>): Promise<T> {
      const schema = toGeminiSchema(z.toJSONSchema(request.schema));
      // One deadline for the whole call, so the retry cannot double the wait.
      const signal = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      let input = request.user;
      let problem = "no attempt made";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let response: Response;
        try {
          response = await send(INTERACTIONS_URL, {
            method: "POST",
            headers: { "x-goog-api-key": options.apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: options.model,
              system_instruction: request.system,
              input,
              response_format: { type: "text", mime_type: "application/json", schema },
              generation_config: {
                max_output_tokens:
                  (request.maxTokens ?? DEFAULT_MAX_TOKENS) + THINKING_HEADROOM_TOKENS,
              },
              store: false,
            }),
            signal,
          });
        } catch (error) {
          if (signal.aborted) throw new LlmError("LLM request timed out", { cause: error });
          throw new LlmError("LLM request failed", { cause: error });
        }
        if (!response.ok) {
          throw new LlmError(`LLM request failed (${response.status})`);
        }

        const interaction = (await response.json().catch(() => null)) as Interaction | null;
        if (interaction?.status === "incomplete") {
          // Cut off before finishing; there is no usable output to correct.
          problem = "the response was incomplete";
          continue;
        }
        if (interaction?.status !== "completed") {
          throw new LlmError(`LLM request ended with status "${interaction?.status ?? "unknown"}"`);
        }

        const text = outputText(interaction);
        let output: unknown;
        try {
          output = JSON.parse(text);
        } catch {
          problem = "the response was not valid JSON";
          continue;
        }

        const parsed = request.schema.safeParse(output);
        if (parsed.success) return parsed.data;

        problem = describeIssues(parsed.error);
        input = `${request.user}\n\nYour previous answer was rejected:\n${text}\n\nIt did not match the schema: ${problem}. Answer again with corrected JSON.`;
      }

      throw new LlmError(`LLM output was invalid after ${MAX_ATTEMPTS} attempts: ${problem}`);
    },
  };
}
