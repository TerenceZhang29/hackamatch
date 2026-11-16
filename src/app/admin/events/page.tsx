import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { FORMAT_LABELS } from "@/lib/event-details";
import { SOURCE_LABELS } from "@/lib/event-sources";
import { formatDateRange, localDateString } from "@/lib/time";
import { listEvents } from "@/server/admin";
import { getSuggestion, listSuggestions } from "@/server/event-suggestions";
import { dismissSuggestionAction } from "../actions";
import { AdminShell, ScrollTable, Notice, button, table, td, th } from "../ui";
import { EventForm } from "./EventForm";

// "Fill from event site" reads a page and makes one model call (P1-25).
export const maxDuration = 60;

export default async function AdminEvents({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/admin/events");
  const params = await searchParams;
  const today = localDateString(getConfig().APP_TIMEZONE);
  const suggestionId =
    typeof params.suggestion === "string" && /^[0-9a-f-]{36}$/i.test(params.suggestion)
      ? params.suggestion
      : null;
  const [events, suggestions, reviewing] = await Promise.all([
    listEvents(),
    listSuggestions(today),
    suggestionId ? getSuggestion(suggestionId) : null,
  ]);
  return (
    <AdminShell title="Events">
      <Notice params={params} />
      {suggestions.length > 0 ? (
        <section id="suggested" aria-labelledby="suggested-heading" className="flex flex-col gap-2">
          <h2 id="suggested-heading" className="text-lg font-semibold">
            Suggested ({suggestions.length})
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Found by the weekly check on MLH, Devpost and Luma. Nobody sees these until you review
            and save one. Dismissed ones don&apos;t come back.
          </p>
          <ScrollTable label="Suggested hackathons">
            <table className={table}>
              <thead>
                <tr>
                  <th className={th}>Hackathon</th>
                  <th className={th}>Dates</th>
                  <th className={th}>Where</th>
                  <th className={th}>Found on</th>
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.id} aria-label={s.name}>
                    <td className={td}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                        {s.name}
                      </a>
                      {s.pageRead ? null : (
                        <span className="block text-xs text-neutral-500">
                          Page not read; fill it in by hand
                        </span>
                      )}
                    </td>
                    <td className={td}>{formatDateRange(s.startDate, s.endDate)}</td>
                    <td className={td}>
                      {[s.venue, s.format && s.format !== "in_person" && FORMAT_LABELS[s.format]]
                        .filter(Boolean)
                        .join(" · ") || "–"}
                    </td>
                    <td className={td}>{SOURCE_LABELS[s.source]}</td>
                    <td className={td}>
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/events?suggestion=${s.id}#new-event`}
                          className={button}
                          aria-label={`Review ${s.name}`}
                        >
                          Review
                        </Link>
                        <form action={dismissSuggestionAction}>
                          <input type="hidden" name="suggestionId" value={s.id} />
                          <button type="submit" className={button} aria-label={`Dismiss ${s.name}`}>
                            Dismiss
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </section>
      ) : null}
      <h2 className="text-lg font-semibold">All events</h2>
      <ScrollTable label="Events">
        <table className={table}>
          <thead>
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Dates</th>
              <th className={th}>Team size</th>
              <th className={th}>Share link</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} aria-label={event.name}>
                <td className={td}>
                  <Link href={`/admin/events/${event.id}`} className="underline">
                    {event.name}
                  </Link>
                </td>
                <td className={td}>{formatDateRange(event.start_date, event.end_date)}</td>
                <td className={td}>
                  {event.team_size_min}–{event.team_size_max}
                </td>
                <td className={td}>
                  <code>/e/{event.slug}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <h2 id="new-event" className="scroll-mt-4 text-lg font-semibold">
        {reviewing ? `New event: ${reviewing.name}` : "New event"}
      </h2>
      {reviewing ? (
        <p role="status" className="rounded bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950">
          {reviewing.pageRead
            ? `Filled from ${SOURCE_LABELS[reviewing.source]} and the event's page (outlined). Check every field before saving; empty ones weren't on the page.`
            : `Only what ${SOURCE_LABELS[reviewing.source]} lists is filled (outlined): the event's page couldn't be read. Use "Fill from event site", or paste the page's text.`}{" "}
          <Link href="/admin/events#new-event" className="underline">
            Start blank instead
          </Link>
        </p>
      ) : suggestionId ? (
        <p role="status" className="rounded bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-900">
          That suggestion was already reviewed.
        </p>
      ) : null}
      <EventForm key={reviewing?.id ?? "blank"} suggestion={reviewing ?? undefined} />
    </AdminShell>
  );
}
