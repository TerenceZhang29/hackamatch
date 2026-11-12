import { blockAction, reportAction } from "@/app/actions/safety";
import { buttonClass } from "@/components/ui/Button";
import { inputClass, labelClass, Select } from "@/components/ui/Field";
import { REPORT_NOTE_MAX, REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/safety";

/**
 * "Report or block" under a person's card and on a pair page: closed until
 * asked for, and plain forms, so it works without JavaScript. Blocking hides
 * each person from the other; reporting also tells the admins why.
 */
export function ReportBlock({ userId, name }: { userId: string; name: string }) {
  return (
    <details className="rounded-2xl bg-surface px-5 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-muted">Report or block</summary>
      <div className="flex flex-col gap-4 pt-3 pb-2">
        <form action={blockAction} className="flex flex-wrap items-center justify-between gap-3">
          <input type="hidden" name="userId" value={userId} />
          <p>You and {name} won&apos;t see each other again.</p>
          <button type="submit" className={buttonClass("outline", "sm")}>
            Block
          </button>
        </form>
        <form action={reportAction} className="flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="userId" value={userId} />
          <label htmlFor="report-reason" className={labelClass}>
            Report {name} to HackaMatch
          </label>
          <Select id="report-reason" name="reason" required defaultValue="">
            <option value="" disabled>
              Pick a reason
            </option>
            {REPORT_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {REPORT_REASON_LABELS[reason]}
              </option>
            ))}
          </Select>
          <label htmlFor="report-note" className="sr-only">
            What happened? (optional)
          </label>
          <textarea
            id="report-note"
            name="note"
            rows={3}
            maxLength={REPORT_NOTE_MAX}
            placeholder="What happened? (optional)"
            className={inputClass}
          />
          <button type="submit" className={buttonClass("danger", "sm", "self-start")}>
            Report and block
          </button>
        </form>
      </div>
    </details>
  );
}
