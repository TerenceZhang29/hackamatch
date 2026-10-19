"use client";

import { formatDateRange } from "@/lib/time";

export interface PickableEvent {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

/** Toggle chips for upcoming events. Optional: nothing selected is fine. */
export function EventPicker({
  events,
  selected,
  onChange,
}: {
  events: PickableEvent[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  if (events.length === 0) return null;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        Hackathons <span className="font-normal text-muted">(optional)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {events.map((event) => {
          const on = selected.includes(event.id);
          return (
            <button
              key={event.id}
              type="button"
              aria-pressed={on}
              onClick={() =>
                onChange(on ? selected.filter((id) => id !== event.id) : [...selected, event.id])
              }
              className={`rounded-2xl px-4 py-2.5 text-left text-sm font-medium transition ${
                on ? "bg-accent text-accent-ink" : "bg-surface hover:bg-surface-2"
              }`}
            >
              {event.name}
              <span className={on ? "" : "text-muted"}>
                {" · "}
                {formatDateRange(event.start_date, event.end_date)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
