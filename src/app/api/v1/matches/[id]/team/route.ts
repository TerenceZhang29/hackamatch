import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid, readBody } from "@/lib/api/http";
import { teamUpInput, teamUpSchema } from "@/lib/api/schemas";
import { pairView } from "@/server/api-views";
import { teamUp } from "@/server/teams";

/** "We teamed up", for one event or (`eventId: null`) a side project. Pressing it twice makes one team. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  const body = await readBody(request, teamUpInput);
  if (!body.ok) return body.response;
  if (!isUuid(id)) return apiError("not_found");

  const result = await teamUp(id, user.id, body.data.eventId);
  const pair = result ? await pairView(id, user.id) : null;
  return result && pair
    ? apiJson(teamUpSchema, { created: result.created, pair })
    : apiError("not_found");
}
