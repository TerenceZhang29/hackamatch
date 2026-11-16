import { requireApiUser } from "@/lib/api/auth";
import { apiJson, readBody } from "@/lib/api/http";
import { deviceInput, okSchema } from "@/lib/api/schemas";
import { registerDevice } from "@/server/push";

/** Keeps this phone's push token for the caller, joined or not, so sign-up's matches can reach them. */
export async function PUT(request: Request) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = await readBody(request, deviceInput);
  if (!body.ok) return body.response;
  await registerDevice(user.id, body.data.token, body.data.environment);
  return apiJson(okSchema, { ok: true });
}
