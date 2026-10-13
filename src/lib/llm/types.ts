import type { z } from "zod";

export interface StructuredRequest<T> {
  system: string;
  user: string;
  /** Validates the model's output; also sent to the model as the tool's input schema. */
  schema: z.ZodType<T>;
  /** Name of the single tool the model must call. The fake provider dispatches on it. */
  toolName: string;
  maxTokens?: number;
  /** Deadline for the whole call, including the one validation retry. */
  timeoutMs?: number;
}

export interface LlmClient {
  /** Asks the model for one object matching `schema`. Throws `LlmError` on any failure. */
  structured<T>(request: StructuredRequest<T>): Promise<T>;
}

/** The only error `llm.structured` throws: provider failure, timeout, refusal or invalid output. */
export class LlmError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LlmError";
  }
}
