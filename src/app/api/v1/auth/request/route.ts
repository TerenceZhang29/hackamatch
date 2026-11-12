import { z } from "zod";
import { normalizeEmail } from "@/lib/auth-helpers";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { authRequestInput, okSchema } from "@/lib/api/schemas";
import { DOMAIN_ERROR, sendMagicLink } from "@/server/magic-link";

const emailSchema = z.string().transform(normalizeEmail).pipe(z.email().max(254));

/**
 * Emails a sign-in code (and the usual link). Public: the same checks as the
 * web's sign-in form run inside `sendMagicLink` (allowed domain, per-address
 * and per-IP limits, the pilot list), and its refusals come back as the message.
 */
export async function POST(request: Request) {
  const body = await readBody(request, authRequestInput);
  if (!body.ok) return body.response;
  const email = emailSchema.safeParse(body.data.email);
  if (!email.success) return apiError("refused", DOMAIN_ERROR);

  const sent = await sendMagicLink(email.data, null);
  return sent.ok ? apiJson(okSchema, { ok: true }) : apiError("refused", sent.message);
}
