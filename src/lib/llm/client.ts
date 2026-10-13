import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { fakeLlm } from "./fake";
import { LlmError, type LlmClient, type StructuredRequest } from "./types";

export { LlmError, type LlmClient, type StructuredRequest } from "./types";

const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
/** One request, plus one retry when the output fails validation. */
const MAX_ATTEMPTS = 2;

function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema);
  if (jsonSchema.type !== "object") {
    throw new LlmError("llm.structured needs an object schema");
  }
  return jsonSchema as Anthropic.Tool.InputSchema;
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Claude implementation: structured output through a single forced tool call.
 *
 * Forcing the tool is accepted by the Haiku family (the `LLM_MODEL_FAST`
 * default); current Opus and Sonnet models reject a forced `tool_choice`, so
 * pointing `LLM_MODEL_FAST` at one of them needs a change here.
 */
export function createAnthropicLlm(client: Pick<Anthropic, "messages">, model: string): LlmClient {
  return {
    async structured<T>(request: StructuredRequest<T>): Promise<T> {
      const tool: Anthropic.Tool = {
        name: request.toolName,
        description: "Record the result. Always call this tool exactly once.",
        input_schema: toInputSchema(request.schema),
      };
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: request.user }];
      // One deadline for the whole call, so the retry cannot double the wait.
      const signal = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      let problem = "no attempt made";

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let response: Anthropic.Message;
        try {
          response = await client.messages.create(
            {
              model,
              max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
              system: request.system,
              messages,
              tools: [tool],
              tool_choice: { type: "tool", name: tool.name },
            },
            { signal },
          );
        } catch (error) {
          if (signal.aborted) throw new LlmError("LLM request timed out", { cause: error });
          if (error instanceof Anthropic.APIError) {
            throw new LlmError(`LLM request failed (${error.status ?? "network"})`, {
              cause: error,
            });
          }
          throw new LlmError("LLM request failed", { cause: error });
        }

        if (response.stop_reason === "refusal") {
          throw new LlmError("LLM refused the request");
        }

        const toolUse = response.content.find(
          (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === tool.name,
        );
        if (!toolUse) {
          // Nothing to attach an error to, so the retry repeats the request as is.
          problem = `no ${tool.name} call (stop_reason: ${response.stop_reason})`;
          continue;
        }

        const parsed = request.schema.safeParse(toolUse.input);
        if (parsed.success) return parsed.data;

        problem = describeIssues(parsed.error);
        messages.push(
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                is_error: true,
                content: `The input did not match the schema: ${problem}. Call ${tool.name} again with corrected input.`,
              },
            ],
          },
        );
      }

      throw new LlmError(`LLM output was invalid after ${MAX_ATTEMPTS} attempts: ${problem}`);
    },
  };
}

let cached: LlmClient | undefined;

function getLlm(): LlmClient {
  if (!cached) {
    const config = getConfig();
    cached =
      config.LLM_PROVIDER === "anthropic"
        ? createAnthropicLlm(
            new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }),
            config.LLM_MODEL_FAST,
          )
        : fakeLlm;
  }
  return cached;
}

/** The app's LLM, chosen by `LLM_PROVIDER`. The only way app code talks to a model. */
export const llm: LlmClient = {
  structured: (request) => getLlm().structured(request),
};
