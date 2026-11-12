import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { eventGoingInput, eventSchema } from "@/lib/api/schemas";
import { eventView } from "@/server/api-views";
import {
  addEventInterests,
  getEventBySlug,
  getEventPool,
  hasEnded,
  removeEventInterest,
  setInEventPool,
} from "@/server/events";

/**
 * Every choice about one event's pool, as on the web's event page: going or
 * not going, and once matched, keep looking or "I have my team". Returns the
 * event as it now stands.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const { slug } = await params;
  const body = await readBody(request, eventGoingInput);
  if (!body.ok) return body.response;
  const event = /^[a-z0-9-]{1,80}$/.test(slug) ? await getEventBySlug(slug) : null;
  if (!event) return apiError("not_found");
  const { choice, confirmed } = body.data;

  if (choice === "going") {
    if (!hasEnded(event)) await addEventInterests(user.id, [event.id]);
  } else if (choice === "not-going") {
    // With matches for the event, "not going" is asked twice.
    const pool = await getEventPool(user.id, event.id);
    if (pool.matches.length > 0 && !confirmed) {
      return apiError("confirm_needed", "You've matched with people for this event.");
    }
    await removeEventInterest(user.id, event.id);
  } else {
    const pool = await getEventPool(user.id, event.id);
    if (pool.going) await setInEventPool(user.id, event.id, choice !== "have-team");
  }
  const updated = await eventView(user.id, slug);
  return updated ? apiJson(eventSchema, updated) : apiError("not_found");
}
