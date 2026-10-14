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
      <legend className="mb-1 text-sm font-medium">Hackathons you&apos;d join (optional)</legend>
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
              className={`rounded-full border px-3 py-1.5 text-left text-sm ${
                on
                  ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                  : "border-neutral-300 dark:border-neutral-700"
              }`}
            >
              {event.name}
              <span className={on ? "opacity-80" : "text-neutral-500"}>
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
