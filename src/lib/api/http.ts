import { NextResponse } from "next/server";
import type { z } from "zod";

/** Small helpers shared by the `/api/v1` routes (docs/plans/ios-app.md). */

/** The error codes the app can branch on; anything else it shows as its message. */
export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_onboarded"
  | "not_found"
  | "rate_limited"
  | "refused"
  | "invalid_code"
  | "daily_limit"
  | "unavailable"
  | "confirm_needed";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_onboarded: 403,
  not_found: 404,
  rate_limited: 429,
  refused: 422,
  invalid_code: 401,
  daily_limit: 409,
  unavailable: 409,
  confirm_needed: 409,
};

const MESSAGES: Record<ApiErrorCode, string> = {
  bad_request: "Something was wrong with that request.",
  unauthorized: "Sign in again.",
  not_onboarded: "Finish joining first.",
  not_found: "Not found.",
  rate_limited: "Too many tries. Wait a moment.",
  refused: "That didn't work.",
  invalid_code: "That code is wrong or has expired.",
  daily_limit: "That's 15 today. Back tomorrow.",
  unavailable: "They're not available right now.",
  confirm_needed: "Confirm to continue.",
};

/** Responses carry personal data, so nothing between the app and us may keep them. */
const HEADERS = { "Cache-Control": "no-store" };

export function apiError(code: ApiErrorCode, message?: string): NextResponse {
  return NextResponse.json(
    { error: { code, message: message ?? MESSAGES[code] } },
    { status: STATUS[code], headers: HEADERS },
  );
}

/** A 200 with `body`, typed against the route's response schema. */
export function apiJson<S extends z.ZodType>(_schema: S, body: z.input<S>): NextResponse {
  return NextResponse.json(body, { headers: HEADERS });
}

/** The request's JSON body checked against `schema`, or the 400 to send back. */
export async function readBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: NextResponse }> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, response: apiError("bad_request", firstMessage(parsed.error)) };
}

/** A schema's own message for its first issue ("Add your first name"), unless it is zod's generic wording. */
function firstMessage(error: z.ZodError): string | undefined {
  const message = error.issues[0]?.message;
  return message && !/^(Invalid|Too (big|small)|Unrecognized)/.test(message) ? message : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
