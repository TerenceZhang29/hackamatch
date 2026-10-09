/**
 * Config that is safe to ship to the browser. Next.js inlines
 * `process.env.NEXT_PUBLIC_*` only when accessed literally, so these must stay
 * written out rather than read from `getConfig()` (which also needs server-only
 * secrets). Values are validated at boot by `getConfig()` in src/instrumentation.ts.
 */
export function getPublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return { supabaseUrl, supabaseAnonKey };
}
