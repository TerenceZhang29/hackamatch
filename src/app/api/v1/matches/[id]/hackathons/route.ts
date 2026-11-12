import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid, readBody } from "@/lib/api/http";
import { pairSchema, pairVoteInput } from "@/lib/api/schemas";
import { pairView } from "@/server/api-views";
import { setEventVote } from "@/server/teams";

/** "I'd do this": adds or removes the caller's pick of a hackathon on a pair page. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  const body = await readBody(request, pairVoteInput);
  if (!body.ok) return body.response;
  if (!isUuid(id)) return apiError("not_found");

  // False for anyone outside the revealed match, and for an event that has ended.
  if (!(await setEventVote(id, user.id, body.data.eventId, body.data.on))) {
    return apiError("not_found");
  }
  const pair = await pairView(id, user.id);
  return pair ? apiJson(pairSchema, pair) : apiError("not_found");
}
