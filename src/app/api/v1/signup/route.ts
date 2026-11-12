import { after } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiJson, readBody } from "@/lib/api/http";
import { meSchema } from "@/lib/api/schemas";
import { answersSchema } from "@/lib/signup";
import { meView } from "@/server/api-views";
import { embedUserAndIdeas } from "@/server/profiles";
import { completeSignup } from "@/server/signup";

/**
 * Joins the pool with the sign-up answers (hackathons, areas, skills, name).
 * The app asks them before the email and keeps them on the phone, so they
 * arrive here once the code is verified; nothing waits on the server.
 * For someone who has already joined, nothing changes.
 */
export async function POST(request: Request) {
  const { user, response } = await requireApiUser(request);
  if (!user) return response;
  const body = await readBody(request, answersSchema);
  if (!body.ok) return body.response;

  if (await completeSignup(user.id, body.data)) after(() => embedUserAndIdeas(user.id));
  return apiJson(meSchema, await meView(user.id));
}
