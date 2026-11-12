import { requireAdmin } from "@/lib/auth";
import { isPaused } from "@/lib/pause";
import { REPORT_REASON_LABELS } from "@/lib/safety";
import { listReports, type AdminReport } from "@/server/safety";
import { resolveReportAction, setUserPause } from "../actions";
import { AdminShell, ScrollTable, button, shortDate, table, td, th } from "../ui";

function Person({ person }: { person: { name: string | null; email: string } | null }) {
  if (!person) return <span className="text-neutral-500">Deleted account</span>;
  return (
    <>
      {person.name ?? "–"}
      <br />
      <span className="text-neutral-500">{person.email}</span>
    </>
  );
}

function ReportRow({ report }: { report: AdminReport }) {
  const paused = isPaused(report.reported.pausedUntil);
  const open = report.status === "open";
  return (
    <tr aria-label={`Report about ${report.reported.email}`}>
      <td className={td}>{shortDate(report.createdAt)}</td>
      <td className={td}>
        <Person person={report.reported} />
        {report.reportsAboutReported > 1 ? (
          <span className="ml-1 text-xs">({report.reportsAboutReported} reports)</span>
        ) : null}
        {paused ? <span className="ml-1 text-xs">(paused)</span> : null}
      </td>
      <td className={td}>
        {REPORT_REASON_LABELS[report.reason]}
        {report.note ? (
          <p className="mt-1 max-w-md whitespace-pre-wrap text-neutral-500">{report.note}</p>
        ) : null}
      </td>
      <td className={td}>
        <Person person={report.reporter} />
      </td>
      <td className={td}>
        <div className="flex flex-wrap gap-2">
          <form action={setUserPause}>
            <input type="hidden" name="userId" value={report.reported.id} />
            <input type="hidden" name="choice" value={paused ? "resume" : "indefinite"} />
            <button type="submit" className={button}>
              {paused ? "Unpause account" : "Pause account"}
            </button>
          </form>
          <form action={resolveReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <input type="hidden" name="resolved" value={String(open)} />
            <button type="submit" className={button}>
              {open ? "Resolve" : "Reopen"}
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}

/**
 * Reports from members (docs/plans/ios-app.md, phase 2): open ones first,
 * oldest first, since each should be looked at within 24 hours. Pausing takes
 * the reported account out of the pool; resolving records that it was dealt with.
 */
export default async function AdminReports() {
  await requireAdmin("/admin/reports");
  const reports = await listReports();
  const open = reports.filter((report) => report.status === "open");
  const resolved = reports.filter((report) => report.status === "resolved");
  const list = (label: string, rows: AdminReport[]) => (
    <ScrollTable label={label}>
      <table className={table}>
        <thead>
          <tr>
            <th className={th}>Date</th>
            <th className={th}>Reported</th>
            <th className={th}>Reason</th>
            <th className={th}>Reported by</th>
            <th className={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
  return (
    <AdminShell title="Reports">
      <p className="text-sm text-neutral-500">
        Review each report within 24 hours. A report already hides the two people from each other.
      </p>
      <h2 className="text-lg font-semibold">Open ({open.length})</h2>
      {open.length ? list("Open reports", open) : <p className="text-sm">Nothing to review.</p>}
      {resolved.length ? (
        <>
          <h2 className="text-lg font-semibold">Resolved ({resolved.length})</h2>
          {list("Resolved reports", resolved)}
        </>
      ) : null}
    </AdminShell>
  );
}
