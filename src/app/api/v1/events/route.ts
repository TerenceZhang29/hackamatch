import { getApiUser } from "@/lib/api/auth";
import { apiJson } from "@/lib/api/http";
import { eventsSchema } from "@/lib/api/schemas";
import { eventsView } from "@/server/api-views";

/**
 * Upcoming hackathons. Public, like the web's `/events` (sign-up's first step
 * lists them before there is an account); a member's token adds which ones
 * they're going to and how many people still need a team.
 */
export async function GET(request: Request) {
  const user = await getApiUser(request);
  return apiJson(eventsSchema, await eventsView(user?.onboarded_at ? user.id : null));
}
