import { getApiUser } from "@/lib/api/auth";
import { apiError, apiJson } from "@/lib/api/http";
import { eventSchema } from "@/lib/api/schemas";
import { eventView } from "@/server/api-views";

/**
 * One event's page. Public, like the web's `/e/<slug>`; a member's token adds
 * the tracks, who's going and their own place in the event's pool.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return apiError("not_found");
  const user = await getApiUser(request);
  const event = await eventView(user?.onboarded_at ? user.id : null, slug);
  return event ? apiJson(eventSchema, event) : apiError("not_found");
}
