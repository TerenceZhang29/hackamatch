import { createBrowserClient } from "@supabase/ssr";
import { getPublicConfig } from "@/lib/public-config";
import type { Database } from "@/types/db";

/** User-scoped client for Client Components. RLS applies. */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
