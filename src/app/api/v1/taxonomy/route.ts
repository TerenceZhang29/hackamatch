import { NextResponse } from "next/server";
import { taxonomyView } from "@/server/api-views";

/** The areas and skills to pick from. Public and the same for everyone, so it may be cached. */
export function GET() {
  return NextResponse.json(taxonomyView(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
