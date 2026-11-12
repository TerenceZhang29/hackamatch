"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { LIMITS } from "@/lib/rate-limit";
import { reportInput } from "@/lib/safety";
import { allow } from "@/server/rate-limit";
import { blockUser, notifyAdminsOfReport, reportUser, unblockUser } from "@/server/safety";

const target = z.object({ userId: z.guid() });

/**
 * Report and block, from a person's page or a pair page. Plain form posts, so
 * they work without JavaScript. Both end on /matches: the person's own pages
 * are gone for the viewer once they are blocked.
 */

/** "Block": neither person sees the other again, whoever blocked. */
export async function blockAction(data: FormData): Promise<void> {
  const user = await requireOnboarded("/matches");
  const parsed = target.safeParse(Object.fromEntries(data));
  if (!parsed.success) redirect("/matches");
  if (!(await allow(LIMITS.reports, user.id))) redirect("/matches?error=busy");

  const blocked = await blockUser(user.id, parsed.data.userId);
  revalidatePath("/", "layout");
  redirect(blocked ? "/matches?blocked=1" : "/matches?error=failed");
}

/** "Report and block": tells the admins why, and blocks. */
export async function reportAction(data: FormData): Promise<void> {
  const user = await requireOnboarded("/matches");
  const parsed = reportInput.safeParse(Object.fromEntries(data));
  if (!parsed.success) redirect("/matches?error=failed");
  if (!(await allow(LIMITS.reports, user.id))) redirect("/matches?error=busy");

  const { userId, reason, note } = parsed.data;
  const report = await reportUser(user.id, userId, reason, note);
  if (!report) redirect("/matches?error=failed");
  // After the response, so the report doesn't wait on the email.
  after(() => notifyAdminsOfReport(report.reportId));
  revalidatePath("/", "layout");
  redirect("/matches?reported=1");
}

/** "Unblock" on /me. Only the caller's own block is removed. */
export async function unblockAction(data: FormData): Promise<void> {
  const user = await requireOnboarded("/me");
  const parsed = target.safeParse(Object.fromEntries(data));
  if (parsed.success) await unblockUser(user.id, parsed.data.userId);
  revalidatePath("/", "layout");
  redirect("/me");
}
