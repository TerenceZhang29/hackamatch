import { normalizeEmail } from "@/lib/auth-helpers";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { authVerifyInput, sessionSchema } from "@/lib/api/schemas";
import { verifyEmailCode, verifyEmailLink } from "@/server/api-auth";

/**
 * Trades the emailed code (or the emailed link's token, when the link opened
 * the app) for a session. Public; code guesses are limited per address.
 */
export async function POST(request: Request) {
  const body = await readBody(request, authVerifyInput);
  if (!body.ok) return apiError("invalid_code");

  const result =
    "tokenHash" in body.data
      ? await verifyEmailLink(body.data.tokenHash)
      : await verifyEmailCode(normalizeEmail(body.data.email), body.data.code);
  return result.ok ? apiJson(sessionSchema, result.session) : apiError(result.error);
}
