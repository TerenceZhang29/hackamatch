import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { deckAnswerInput, deckAnswerSchema } from "@/lib/api/schemas";
import { passToken } from "@/lib/deck";
import { LIMITS } from "@/lib/rate-limit";
import { answerFromBoard, matchedFirstName } from "@/server/matches";
import { allow } from "@/server/rate-limit";

/** Interested or Pass on a person's card, from the deck or their profile. */
export async function POST(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const body = await readBody(request, deckAnswerInput);
  if (!body.ok) return body.response;
  if (!(await allow(LIMITS.answers, user.id))) return apiError("rate_limited");

  const { userId, response: answer } = body.data;
  const result = await answerFromBoard(user.id, { kind: "person", userId }, answer);
  if (!result.ok) {
    if (result.error === "limit") return apiError("daily_limit");
    return apiError(result.error === "self" ? "bad_request" : "unavailable");
  }
  if (result.response === "pass") {
    return apiJson(deckAnswerSchema, {
      response: "pass",
      undoToken: passToken("person", userId),
      matchId: null,
      matchedName: null,
    });
  }
  return apiJson(deckAnswerSchema, {
    response: "interested",
    undoToken: null,
    matchId: result.matchId,
    matchedName: result.revealed ? await matchedFirstName(result.matchId, user.id) : null,
  });
}
