import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, isUuid } from "@/lib/api/http";
import { blocksSchema } from "@/lib/api/schemas";
import { LIMITS } from "@/lib/rate-limit";
import { allow } from "@/server/rate-limit";
import { blockUser, listBlocked, unblockUser } from "@/server/safety";

type Context = { params: Promise<{ id: string }> };

/** Blocks someone: neither person sees the other again. Returns the caller's blocked list. */
export async function PUT(request: Request, { params }: Context) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return apiError("not_found");
  if (!(await allow(LIMITS.reports, user.id))) return apiError("rate_limited");
  if (!(await blockUser(user.id, id))) return apiError("not_found");
  return apiJson(blocksSchema, { blocked: await listBlocked(user.id) });
}

/** Removes the caller's own block. The other person's block, if any, stays. */
export async function DELETE(request: Request, { params }: Context) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return apiError("not_found");
  await unblockUser(user.id, id);
  return apiJson(blocksSchema, { blocked: await listBlocked(user.id) });
}
