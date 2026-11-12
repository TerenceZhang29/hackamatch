import { after } from "next/server";
import { requireApiMember } from "@/lib/api/auth";
import { apiError, apiJson, readBody } from "@/lib/api/http";
import { okSchema } from "@/lib/api/schemas";
import { LIMITS } from "@/lib/rate-limit";
import { reportInput } from "@/lib/safety";
import { allow } from "@/server/rate-limit";
import { notifyAdminsOfReport, reportUser } from "@/server/safety";

/** Reports someone to the admins, with a reason, and blocks them. */
export async function POST(request: Request) {
  const { user, response } = await requireApiMember(request);
  if (!user) return response;
  const body = await readBody(request, reportInput);
  if (!body.ok) return body.response;
  if (!(await allow(LIMITS.reports, user.id))) return apiError("rate_limited");

  const { userId, reason, note } = body.data;
  const report = await reportUser(user.id, userId, reason, note);
  if (!report) return apiError("not_found");
  // After the response, so the report doesn't wait on the email.
  after(() => notifyAdminsOfReport(report.reportId));
  return apiJson(okSchema, { ok: true });
}
