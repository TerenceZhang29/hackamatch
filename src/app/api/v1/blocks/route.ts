import { requireApiMember } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/http";
import { blocksSchema } from "@/lib/api/schemas";
import { listBlocked } from "@/server/safety";

/** The people the caller has blocked. Nobody can see who blocked them. */
export async function GET(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  return apiJson(blocksSchema, { blocked: await listBlocked(user.id) });
}
