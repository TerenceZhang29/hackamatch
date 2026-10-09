import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicConfig } from "@/lib/public-config";
import type { Database } from "@/types/db";

/**
 * User-scoped client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user (or anon), so RLS applies. Create one per request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getPublicConfig();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. The middleware refreshes the
          // session on every request, so this is safe to ignore there.
        }
      },
    },
  });
}
