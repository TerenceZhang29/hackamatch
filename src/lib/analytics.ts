import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/types/db";

/** Canonical analytics event names. See docs/IMPLEMENTATION_PLAN.md P1-15. */
export const ANALYTICS_EVENTS = [
  "board_viewed",
  "cta_clicked",
  "magic_link_requested",
  "magic_link_clicked",
  "onboarding_step_completed",
  "pool_joined",
  "idea_posted",
  "interest_expressed",
  "passed",
  "mutual_match",
  "team_formed",
  "digest_sent",
  "digest_link_clicked",
  "paused",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/**
 * Records an analytics event. Uses the service client because
 * `analytics_events` is written by server code only. Never throws: analytics
 * must not break the user's request.
 */
export async function track(
  name: AnalyticsEvent,
  props: { [key: string]: Json | undefined } = {},
  userId?: string | null,
): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("analytics_events")
      .insert({ name, props, user_id: userId ?? null });
    if (error) console.error(`analytics: failed to record "${name}"`, error.message);
  } catch (error) {
    console.error(`analytics: failed to record "${name}"`, error);
  }
}
