import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDateRange } from "@/lib/time";
import { listEvents } from "@/server/admin";
import { AdminShell, Notice, table, td, th } from "../ui";
import { EventForm } from "./EventForm";

export default async function AdminEvents({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/admin/events");
  const [events, params] = await Promise.all([listEvents(), searchParams]);
  return (
    <AdminShell title="Events">
      <Notice params={params} />
      <div className="overflow-x-auto">
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
      </div>
      <h2 className="text-lg font-semibold">New event</h2>
      <EventForm />
    </AdminShell>
  );
}
