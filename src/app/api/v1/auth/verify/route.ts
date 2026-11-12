import { normalizeEmail } from "@/lib/auth-helpers";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { authVerifyInput, sessionSchema } from "@/lib/api/schemas";
import { verifyEmailCode } from "@/server/api-auth";

/** Trades the emailed code for a session. Public; guesses are limited per address. */
export async function POST(request: Request) {
  const body = await readBody(request, authVerifyInput);
  if (!body.ok) return apiError("invalid_code");

  const result = await verifyEmailCode(normalizeEmail(body.data.email), body.data.code);
  return result.ok ? apiJson(sessionSchema, result.session) : apiError(result.error);
}
