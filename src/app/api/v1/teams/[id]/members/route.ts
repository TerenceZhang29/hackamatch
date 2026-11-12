import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid, readBody } from "@/lib/api/http";
import { okSchema, teamMemberInput } from "@/lib/api/schemas";
import { addTeamMember } from "@/server/teams";

/**
 * Adds a teammate by email to a team the caller is on. Only someone the
 * caller has a mutual match with can be added; the refusal says why.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  const body = await readBody(request, teamMemberInput);
  if (!body.ok) return body.response;
  if (!isUuid(id)) return apiError("not_found");

  const result = await addTeamMember(id, user.id, body.data.email);
  return result.ok ? apiJson(okSchema, { ok: true }) : apiError("refused", result.error);
}
