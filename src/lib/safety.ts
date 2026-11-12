import { z } from "zod";

/** Report and block: the reasons and the input shape, shared by the web forms and the API. */

export const REPORT_REASONS = ["harassment", "inappropriate", "spam", "fake", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment or bullying",
  inappropriate: "Inappropriate content",
  spam: "Spam or advertising",
  fake: "Fake profile or impersonation",
  other: "Something else",
};

export const REPORT_NOTE_MAX = 1000;

export const reportInput = z.object({
  userId: z.guid(),
  reason: z.enum(REPORT_REASONS, { error: "Pick a reason" }),
  note: z
    .string()
    .trim()
    .max(REPORT_NOTE_MAX, `Keep it under ${REPORT_NOTE_MAX} characters`)
    .nullish()
    .transform((value) => value || null),
});
