import type { AdminEvent } from "@/server/admin";
import { EVENT_NAME_MAX } from "@/lib/event-name";
import { displayLabel } from "@/lib/taxonomy/labels";
import { slugsOf } from "@/lib/taxonomy/skills";
import { saveEventAction } from "../actions";
import { button, input } from "../ui";

/** Create or edit an event. A plain form; validation errors come back in the URL. */
export function EventForm({
  event,
  organizerEmail,
}: {
  event?: AdminEvent;
  organizerEmail?: string | null;
}) {
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
