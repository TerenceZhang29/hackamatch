import { apiError, apiJson, readBody } from "@/lib/api/http";
import { authRefreshInput, sessionSchema } from "@/lib/api/schemas";
import { refreshApiSession } from "@/server/api-auth";

/** A new session from a refresh token. Public: the refresh token is the proof. */
export async function POST(request: Request) {
  const body = await readBody(request, authRefreshInput);
  if (!body.ok) return apiError("unauthorized");

  const session = await refreshApiSession(body.data.refreshToken);
  return session ? apiJson(sessionSchema, session) : apiError("unauthorized");
}
