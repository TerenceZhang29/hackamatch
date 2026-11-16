import { requireApiUser } from "@/lib/api/auth";
import { apiError, apiJson } from "@/lib/api/http";
import { DEVICE_TOKEN, okSchema } from "@/lib/api/schemas";
import { removeDevice } from "@/server/push";

/** Forgets this phone (the app calls it before signing out). Only the caller's own token. */
export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const { token } = await params;
  if (!DEVICE_TOKEN.test(token)) return apiError("not_found");
  await removeDevice(user.id, token);
  return apiJson(okSchema, { ok: true });
}
