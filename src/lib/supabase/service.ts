import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config";
import type { Database } from "@/types/db";

/**
 * Service-role client. Bypasses RLS, so only privileged code may use it:
 * cron jobs, one-click token links, admin pages and src/server services
 * (enforced by ESLint, see eslint.config.mjs). Always authorize the caller
 * before using it on their behalf.
 */
export function createServiceClient() {
  const config = getConfig();
  return createSupabaseClient<Database>(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
