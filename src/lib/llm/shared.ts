import type { z } from "zod";

/** Defaults and helpers shared by the real providers. */

export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_TIMEOUT_MS = 20_000;
/** One request, plus one retry when the output fails validation. */
export const MAX_ATTEMPTS = 2;

export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}
