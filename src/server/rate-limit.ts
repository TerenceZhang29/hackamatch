import "server-only";
import { limitKey, type Limit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Counts one hit against a limit and returns whether it is allowed. If the
 * counter can't be reached, the request is allowed and the error logged:
 * rate limiting must not take the app down.
 */
export async function allow(
  limit: Limit,
  subject: string,
  max: number = limit.max,
): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("hit_rate_limit", {
    p_key: limitKey(limit, subject),
    p_window_seconds: limit.windowSeconds,
    p_max: max,
  });
  if (error) {
    console.error(`rate limit ${limit.name} unavailable`, error.message);
    return true;
  }
  return data;
}
