import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid } from "@/lib/api/http";
import { pairSchema } from "@/lib/api/schemas";
import { pairView } from "@/server/api-views";

/**
 * The pair page: contact details, a first message, hackathons and teams.
 * A 404 for anyone outside the match, and until the match is mutual.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  const pair = isUuid(id) ? await pairView(id, user.id) : null;
  return pair ? apiJson(pairSchema, pair) : apiError("not_found");
}
