import "server-only";
import { createElement } from "react";
import { getConfig } from "@/lib/config";
import { displayName } from "@/lib/display-name";
import { Report, reportSubject } from "@/lib/notify/templates/Report";
import { REPORT_REASON_LABELS, type ReportReason } from "@/lib/safety";
import { createServiceClient } from "@/lib/supabase/service";
import { pauseUrl, send } from "./notify";

/**
 * Report and block (docs/plans/ios-app.md, phase 2). A block works both
 * ways: neither person sees the other in the deck, on event pages or in
 * matches, whoever blocked. A report tells the admins and also blocks.
 * Service client: callers must have authorized the acting user.
 */

/** Everyone a user must not see: people they blocked, and people who blocked them. */
export async function blockedIdsFor(userId: string): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  if (error) throw new Error(`blockedIdsFor: ${error.message}`);
  return [
    ...new Set(data.map((row) => (row.blocker_id === userId ? row.blocked_id : row.blocker_id))),
  ];
}

/** Whether either of two people has blocked the other. */
export async function isBlockedPair(x: string, y: string): Promise<boolean> {
  const { count, error } = await createServiceClient()
    .from("blocks")
    .select("blocker_id", { count: "exact", head: true })
    .or(`and(blocker_id.eq.${x},blocked_id.eq.${y}),and(blocker_id.eq.${y},blocked_id.eq.${x})`);
  if (error) throw new Error(`isBlockedPair: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Blocks someone. False when that isn't a person who can be blocked (yourself, or nobody). */
export async function blockUser(blockerId: string, blockedId: string): Promise<boolean> {
  if (blockerId === blockedId) return false;
  const supabase = createServiceClient();
  const { data: target } = await supabase
    .from("users")
    .select("id")
    .eq("id", blockedId)
    .maybeSingle();
  if (!target) return false;
  const { error } = await supabase
    .from("blocks")
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`blockUser: ${error.message}`);
  return true;
}

/** Removes the caller's own block. The other person's block, if any, stays. */
export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);
  if (error) throw new Error(`unblockUser: ${error.message}`);
}

export interface BlockedPerson {
  id: string;
  /** "Maya P.", as on their card. */
  displayName: string;
}

/** The people a user has blocked, newest first, so they can unblock them. */
export async function listBlocked(blockerId: string): Promise<BlockedPerson[]> {
  const supabase = createServiceClient();
  const { data: blocks, error } = await supabase
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listBlocked: ${error.message}`);
  if (blocks.length === 0) return [];
  const ids = blocks.map((row) => row.blocked_id);
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name")
    .in("id", ids);
  if (usersError) throw new Error(`listBlocked: ${usersError.message}`);
  const names = new Map(users.map((user) => [user.id, user.name]));
  return ids.map((id) => ({ id, displayName: displayName(names.get(id)) }));
}

/**
 * Reports someone to the admins and blocks them. Returns false when there is
 * nobody to report. Call `notifyAdminsOfReport` afterwards, off the response.
 */
export async function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  note: string | null,
): Promise<{ reportId: string } | null> {
  if (!(await blockUser(reporterId, reportedId))) return null;
  const { data, error } = await createServiceClient()
    .from("reports")
    .insert({ reporter_id: reporterId, reported_id: reportedId, reason, note })
    .select("id")
    .single();
  if (error) throw new Error(`reportUser: ${error.message}`);
  return { reportId: data.id };
}

/** Emails every admin about a new report. Failures are logged by `send`, never thrown. */
export async function notifyAdminsOfReport(reportId: string): Promise<void> {
  const supabase = createServiceClient();
  const [{ data: report }, { data: admins }] = await Promise.all([
    supabase.from("reports").select("reason, note, reported_id").eq("id", reportId).maybeSingle(),
    supabase.from("users").select("id").eq("is_admin", true),
  ]);
  if (!report || !admins?.length) return;
  const { data: reported } = await supabase
    .from("users")
    .select("name")
    .eq("id", report.reported_id)
    .maybeSingle();
  const reviewUrl = new URL("/admin/reports", getConfig().APP_URL).toString();
  for (const admin of admins) {
    const props = {
      reportedName: displayName(reported?.name),
      reason: REPORT_REASON_LABELS[report.reason],
      note: report.note,
      reviewUrl,
      pauseUrl: pauseUrl(admin.id),
    };
    await send({
      userId: admin.id,
      kind: "report",
      subject: reportSubject(props),
      email: createElement(Report, props),
      payload: { report_id: reportId },
    });
  }
}

export interface AdminReport {
  id: string;
  status: "open" | "resolved";
  reason: ReportReason;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string | null; email: string } | null;
  reported: { id: string; name: string | null; email: string; pausedUntil: string | null };
  /** How many reports, from anyone, name the same person. */
  reportsAboutReported: number;
}

/** Reports for /admin/reports: open ones first, oldest first, then the latest resolved ones. */
export async function listReports(): Promise<AdminReport[]> {
  const supabase = createServiceClient();
  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, status, reason, note, created_at, resolved_at, reporter_id, reported_id")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listReports: ${error.message}`);
  if (reports.length === 0) return [];
  const ids = [
    ...new Set(reports.flatMap((r) => [r.reporter_id, r.reported_id]).filter((id) => id !== null)),
  ];
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, name, cornell_email, paused_until")
    .in("id", ids);
  if (usersError) throw new Error(`listReports: ${usersError.message}`);
  const byId = new Map(users.map((user) => [user.id, user]));
  const about = new Map<string, number>();
  for (const r of reports) about.set(r.reported_id, (about.get(r.reported_id) ?? 0) + 1);

  return reports
    .flatMap((r): AdminReport[] => {
      const reported = byId.get(r.reported_id);
      if (!reported) return [];
      const reporter = r.reporter_id ? byId.get(r.reporter_id) : undefined;
      return [
        {
          id: r.id,
          status: r.status,
          reason: r.reason,
          note: r.note,
          createdAt: r.created_at,
          resolvedAt: r.resolved_at,
          reporter: reporter
            ? { id: reporter.id, name: reporter.name, email: reporter.cornell_email }
            : null,
          reported: {
            id: reported.id,
            name: reported.name,
            email: reported.cornell_email,
            pausedUntil: reported.paused_until,
          },
          reportsAboutReported: about.get(r.reported_id) ?? 0,
        },
      ];
    })
    .sort((a, b) =>
      a.status !== b.status
        ? a.status === "open"
          ? -1
          : 1
        : a.status === "open"
          ? a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt),
    );
}

export async function countOpenReports(): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) throw new Error(`countOpenReports: ${error.message}`);
  return count ?? 0;
}

/** Marks a report as dealt with, or opens it again. */
export async function setReportResolved(reportId: string, adminId: string, resolved: boolean) {
  const { error } = await createServiceClient()
    .from("reports")
    .update(
      resolved
        ? { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: adminId }
        : { status: "open", resolved_at: null, resolved_by: null },
    )
    .eq("id", reportId);
  if (error) throw new Error(`setReportResolved: ${error.message}`);
}
