import { requireApiMember } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/http";
import { matchesSchema } from "@/lib/api/schemas";
import { matchesView } from "@/server/api-views";

/** The Matches tab: waiting, mutual and sent matches, and "Your hackathons". */
export async function GET(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  return apiJson(matchesSchema, await matchesView(user.id));
}
