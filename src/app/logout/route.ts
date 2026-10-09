import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST only: a GET could be triggered by a link prefetch or another site.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign-out failed", error.message);

  // 303 so the browser follows the redirect with GET.
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
}
