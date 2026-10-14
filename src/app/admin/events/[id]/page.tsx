import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { getEvent } from "@/server/admin";
import { AdminShell, Notice } from "../../ui";
import { EventForm } from "../EventForm";

export default async function EditEvent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("/admin/events");
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const event = await getEvent(id);
  if (!event) notFound();
  const { data: organizer } = event.organizer_id
    ? await createServiceClient()
        .from("users")
        .select("cornell_email")
        .eq("id", event.organizer_id)
        .maybeSingle()
    : { data: null };

  return (
    <AdminShell title={`Edit ${event.name}`}>
      <Notice params={await searchParams} />
      <p className="text-sm text-neutral-500">
        Share link: <code>/e/{event.slug}</code> (kept when the name changes)
      </p>
      <EventForm event={event} organizerEmail={organizer?.cornell_email} />
    </AdminShell>
  );
}
