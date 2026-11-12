import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid } from "@/lib/api/http";
import { personPageSchema } from "@/lib/api/schemas";
import { personPageView } from "@/server/api-views";

/** One person's card and where the caller stands with them. Never contact details. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  const page = isUuid(id) ? await personPageView(user.id, id) : null;
  return page ? apiJson(personPageSchema, page) : apiError("not_found");
}
