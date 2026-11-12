import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid, readBody } from "@/lib/api/http";
import { matchAnswerInput, matchAnswerSchema } from "@/lib/api/schemas";
import { LIMITS } from "@/lib/rate-limit";
import { recordResponse } from "@/server/matches";
import { allow } from "@/server/rate-limit";

/** Interested or Pass on a match waiting on the caller. A 404 unless they are in it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  const body = await readBody(request, matchAnswerInput);
  if (!body.ok) return body.response;
  if (!isUuid(id)) return apiError("not_found");
  if (!(await allow(LIMITS.answers, user.id))) return apiError("rate_limited");

  const result = await recordResponse(id, user.id, body.data.response);
  return result
    ? apiJson(matchAnswerSchema, { revealed: result.revealedNow })
    : apiError("not_found");
}
