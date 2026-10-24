"use server";

import { z } from "zod";
import { normalizeEmail, sanitizeNext } from "@/lib/auth-helpers";
import { DOMAIN_ERROR, sendMagicLink } from "@/server/magic-link";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email: string };

const inputSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.email().max(254)),
  next: z.string().max(2048).optional(),
});

export async function requestMagicLink(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const rawEmail = formData.get("email");
  const rawNext = formData.get("next");
  const typedEmail = typeof rawEmail === "string" ? rawEmail.trim() : "";

  const parsed = inputSchema.safeParse({
    email: typedEmail,
    next: typeof rawNext === "string" ? rawNext : undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: DOMAIN_ERROR, email: typedEmail };
  }
  const { email } = parsed.data;
  const next = sanitizeNext(parsed.data.next);

  const sent = await sendMagicLink(email, next);
  return sent.ok
    ? { status: "sent", email }
    : { status: "error", message: sent.message, email: typedEmail };
}
