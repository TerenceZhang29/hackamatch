import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { deckUndoInput, deckUndoSchema } from "@/lib/api/schemas";
import { LIMITS } from "@/lib/rate-limit";
import { undoDeckPass } from "@/server/deck";
import { allow } from "@/server/rate-limit";

/** Undo: takes back the caller's own Pass, so the card shows again. */
export async function POST(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const body = await readBody(request, deckUndoInput);
  if (!body.ok) return body.response;
  if (!(await allow(LIMITS.answers, user.id))) return apiError("rate_limited");

  return apiJson(deckUndoSchema, { undone: await undoDeckPass(user.id, body.data.undoToken) });
}
