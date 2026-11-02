import type { AdminEvent } from "@/server/admin";
import {
  ADMISSION_LABELS,
  ADMISSIONS,
  EMPTY_DETAILS,
  FORMAT_LABELS,
  FORMATS,
  LEVEL_LABELS,
  LEVELS,
  PERK_LABELS,
  PERKS,
  detailsFromRow,
  detailsToForm,
} from "@/lib/event-details";
import { EVENT_NAME_MAX } from "@/lib/event-name";
import { displayLabel } from "@/lib/taxonomy/labels";
import { slugsOf } from "@/lib/taxonomy/skills";
import { saveEventAction } from "../actions";
import { button, input } from "../ui";
import { AutofillPanel } from "./AutofillPanel";

function Field({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

function Choice<T extends string>({
  name,
  options,
  labels,
  value,
}: {
  name: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: string;
}) {
  return (
    <select name={name} defaultValue={value} className={input}>
      <option value="">Not known</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

/** Create or edit an event. A plain form; validation errors come back in the URL. */
export function EventForm({
  event,
  organizerEmail,
}: {
  event?: AdminEvent;
  organizerEmail?: string | null;
}) {
  const details = detailsToForm(event ? detailsFromRow(event) : EMPTY_DETAILS);
  return (
    <form action={saveEventAction} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <input type="hidden" name="eventId" value={event?.id ?? ""} />
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Name
        <input
          name="name"
          required
          maxLength={EVENT_NAME_MAX}
          defaultValue={event?.name}
          className={input}
        />
        <span className="text-xs text-neutral-500">
          {EVENT_NAME_MAX} characters max, so it fits on cards.
        </span>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Start date
        <input
          name="startDate"
          type="date"
          required
          defaultValue={event?.start_date}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        End date
        <input
          name="endDate"
          type="date"
          required
          defaultValue={event?.end_date}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Min team size
        <input
          name="teamSizeMin"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={event?.team_size_min ?? 2}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Max team size
        <input
          name="teamSizeMax"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={event?.team_size_max ?? 4}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Website (optional)
        <input name="url" type="url" defaultValue={event?.url ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Description (optional)
        <textarea
          name="description"
          rows={3}
          defaultValue={event?.description ?? ""}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Time (optional)
        <input
          name="timeLabel"
          maxLength={60}
          placeholder="9:00 AM – 5:00 PM"
          defaultValue={event?.time_label ?? ""}
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Host (optional)
        <input name="host" maxLength={120} defaultValue={event?.host ?? ""} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Venue (optional)
        <input name="venue" maxLength={120} defaultValue={event?.venue ?? ""} className={input} />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm sm:col-span-2">
        <legend>Areas (shown as tags on the event page)</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {slugsOf("domains").map((slug) => (
            <label key={slug} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="domains"
                value={slug}
                defaultChecked={event?.domains.includes(slug)}
              />
              {displayLabel(slug)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-3 border-t border-neutral-200 pt-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="text-base font-semibold">Details people compare hackathons on</legend>
        <p className="text-xs text-neutral-500 sm:col-span-2">
          All optional; the event page hides what&apos;s empty.
        </p>
        <AutofillPanel />
        <Field label="Format">
          <Choice name="format" options={FORMATS} labels={FORMAT_LABELS} value={details.format} />
        </Field>
        <Field label="Length (hours)" hint="24 for an overnight hackathon, about 8 for one day">
          <input
            name="lengthHours"
            type="number"
            min={1}
            max={400}
            defaultValue={details.lengthHours}
            className={input}
          />
        </Field>
        <Field label="Entry fee" hint="Free, or an amount like $25">
          <input name="entryFee" defaultValue={details.entryFee} className={input} />
        </Field>
        <Field label="Level">
          <Choice name="level" options={LEVELS} labels={LEVEL_LABELS} value={details.level} />
        </Field>
        <Field label="Open to" hint="e.g. All students, any school, 18+" wide>
          <input name="openTo" maxLength={120} defaultValue={details.openTo} className={input} />
        </Field>
        <Field label="Apply by">
          <input name="applyBy" type="date" defaultValue={details.applyBy} className={input} />
        </Field>
        <Field label="How they pick people">
          <Choice
            name="admission"
            options={ADMISSIONS}
            labels={ADMISSION_LABELS}
            value={details.admission}
          />
        </Field>
        <Field label="Apply link (https)">
          <input name="applyUrl" type="url" defaultValue={details.applyUrl} className={input} />
        </Field>
        <Field label="Spots">
          <input
            name="capacity"
            type="number"
            min={1}
            defaultValue={details.capacity}
            className={input}
          />
        </Field>
        <Field label="Prize total" hint="e.g. $12,000">
          <input name="prizeTotal" defaultValue={details.prizeTotal} className={input} />
        </Field>
        <Field label="Chat link (https)" hint="Discord or similar">
          <input name="chatUrl" type="url" defaultValue={details.chatUrl} className={input} />
        </Field>
        <Field label="Prizes" hint="One per line: 1st place | $5,000 | optional note" wide>
          <textarea
            name="prizesText"
            rows={4}
            defaultValue={details.prizesText}
            className={input}
          />
        </Field>
        <Field
          label="Tracks"
          hint="One per line: Track | what to build | skills that help, comma-separated (ML, Backend)"
          wide
        >
          <textarea
            name="tracksText"
            rows={4}
            defaultValue={details.tracksText}
            className={input}
          />
        </Field>
        <Field label="Tools you get" hint="e.g. cloud credits, a speech-to-text API" wide>
          <input name="tools" maxLength={300} defaultValue={details.tools} className={input} />
        </Field>
        <Field label="How it's judged" hint="One per line: Impact | 30%" wide>
          <textarea
            name="judgingText"
            rows={3}
            defaultValue={details.judgingText}
            className={input}
          />
        </Field>
        <Field label="Schedule" hint="One per line: 2026-12-05 | 10:00 AM | Check-in" wide>
          <textarea
            name="scheduleText"
            rows={5}
            defaultValue={details.scheduleText}
            className={input}
          />
        </Field>
        <fieldset className="flex flex-col gap-1 text-sm sm:col-span-2">
          <legend>What&apos;s included</legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {PERKS.map((perk) => (
              <label key={perk} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="perks"
                  value={perk}
                  defaultChecked={details.perks.includes(perk)}
                />
                {PERK_LABELS[perk]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Notes on what's included" hint="e.g. Travel up to $100. Bring a laptop." wide>
          <input
            name="perkNotes"
            maxLength={300}
            defaultValue={details.perkNotes}
            className={input}
          />
        </Field>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Organizer email (optional; they don&apos;t need a HackaMatch account)
        <input
          name="organizerEmail"
          type="email"
          defaultValue={organizerEmail ?? ""}
          className={input}
        />
      </label>
      <div>
        <button type="submit" className={button}>
          {event ? "Save event" : "Create event"}
        </button>
      </div>
    </form>
  );
}
