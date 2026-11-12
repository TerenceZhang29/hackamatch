import { bearerToken, getApiUser } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/http";
import { okSchema } from "@/lib/api/schemas";
import { signOutApiSession } from "@/server/api-auth";

/** Ends the caller's session. Always answers ok, so the app can forget its tokens either way. */
export async function POST(request: Request) {
  const token = bearerToken(request);
  // Only a token that still verifies is passed on.
  if (token && (await getApiUser(request))) await signOutApiSession(token);
  return apiJson(okSchema, { ok: true });
}
