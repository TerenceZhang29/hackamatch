import "server-only";
import { createElement } from "react";
import { getConfig } from "@/lib/config";
import type { EventFormat } from "@/lib/event-details";
import type { Known, Listing, Source } from "@/lib/event-sources";
import { urlKey } from "@/lib/event-sources";
import { EventSuggestions, eventSuggestionsSubject } from "@/lib/notify/templates/EventSuggestions";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDateRange } from "@/lib/time";
import type { Json } from "@/types/db";
import type { DraftValues } from "./event-autofill";
import { pauseUrl, send } from "./notify";

/**
 * The `event_suggestions` table (docs/plans/event-discovery.md): what the
 * weekly job found, waiting for an admin in /admin/events.
 */

export interface EventSuggestion {
  id: string;
  source: Source;
  name: string;
  startDate: string;
  endDate: string;
  url: string;
  venue: string | null;
  format: EventFormat | null;
  draft: DraftValues | null;
  /** Whether the draft came from the event's own page (else only the list's hints). */
  pageRead: boolean;
  foundAt: string;
}

type Row = {
  id: string;
  source: string;
  name: string;
  start_date: string;
  end_date: string;
  url: string;
  venue: string | null;
  format: EventFormat | null;
  draft: Json | null;
  page_read: boolean;
  found_at: string;
};

const COLUMNS =
  "id, source, name, start_date, end_date, url, venue, format, draft, page_read, found_at";

function fromRow(row: Row): EventSuggestion {
  return {
    id: row.id,
    source: row.source as Source,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    url: row.url,
    venue: row.venue,
    format: row.format,
    draft: (row.draft as DraftValues | null) ?? null,
    pageRead: row.page_read,
    foundAt: row.found_at,
  };
}

/** Every event and every earlier suggestion (any status), for skipping known ones. */
export async function knownEvents(): Promise<Known[]> {
  const supabase = createServiceClient();
  const [events, suggestions] = await Promise.all([
    supabase.from("events").select("name, start_date, url"),
    supabase.from("event_suggestions").select("name, start_date, url"),
  ]);
  if (events.error) throw new Error(`knownEvents: ${events.error.message}`);
  if (suggestions.error) throw new Error(`knownEvents: ${suggestions.error.message}`);
  return [...events.data, ...suggestions.data].map((row) => ({
    name: row.name,
    startDate: row.start_date,
    url: row.url,
  }));
}

/** Stores new suggestions, skipping any whose page is already suggested. Returns the stored ones. */
export async function insertSuggestions(
  items: readonly (Omit<Listing, "hints"> & { draft: DraftValues | null; pageRead?: boolean })[],
): Promise<EventSuggestion[]> {
  if (items.length === 0) return [];
  const { data, error } = await createServiceClient()
    .from("event_suggestions")
    .upsert(
      items.map((item) => ({
        source: item.source,
        name: item.name,
        start_date: item.startDate,
        end_date: item.endDate,
        url: item.url,
        url_key: urlKey(item.url),
        venue: item.venue,
        format: item.format,
        draft: item.draft as Json,
        page_read: item.pageRead ?? false,
      })),
      { onConflict: "url_key", ignoreDuplicates: true },
    )
    .select(COLUMNS);
  if (error) throw new Error(`insertSuggestions: ${error.message}`);
  return data.map(fromRow);
}

/** Suggestions waiting for review whose event hasn't ended, soonest first. */
export async function listSuggestions(today: string): Promise<EventSuggestion[]> {
  const { data, error } = await createServiceClient()
    .from("event_suggestions")
    .select(COLUMNS)
    .eq("status", "new")
    .gte("end_date", today)
    .order("start_date")
    .limit(100);
  if (error) throw new Error(`listSuggestions: ${error.message}`);
  return data.map(fromRow);
}

/** One suggestion still waiting for review, or null. */
export async function getSuggestion(id: string): Promise<EventSuggestion | null> {
  const { data, error } = await createServiceClient()
    .from("event_suggestions")
    .select(COLUMNS)
    .eq("id", id)
    .eq("status", "new")
    .maybeSingle();
  if (error) throw new Error(`getSuggestion: ${error.message}`);
  return data ? fromRow(data) : null;
}

/** Marks a suggestion reviewed: approved (with the event made from it) or dismissed. */
export async function reviewSuggestion(
  id: string,
  adminId: string,
  outcome: { status: "approved"; eventId: string } | { status: "dismissed" },
): Promise<void> {
  const { error } = await createServiceClient()
    .from("event_suggestions")
    .update({
      status: outcome.status,
      event_id: outcome.status === "approved" ? outcome.eventId : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminId,
    })
    .eq("id", id)
    .eq("status", "new");
  if (error) throw new Error(`reviewSuggestion: ${error.message}`);
}

/** One email to each admin listing what a run found. Failures are logged by `send`. */
export async function notifyAdminsOfSuggestions(
  found: readonly EventSuggestion[],
): Promise<number> {
  if (found.length === 0) return 0;
  const { data: admins, error } = await createServiceClient()
    .from("users")
    .select("id")
    .eq("is_admin", true);
  if (error) throw new Error(`notifyAdminsOfSuggestions: ${error.message}`);
  const reviewUrl = new URL("/admin/events#suggested", getConfig().APP_URL).toString();
  const items = found.map((s) => ({
    name: s.name,
    dates: formatDateRange(s.startDate, s.endDate),
    venue: s.venue,
  }));
  let sent = 0;
  for (const admin of admins) {
    const props = { items, reviewUrl, pauseUrl: pauseUrl(admin.id) };
    const result = await send({
      userId: admin.id,
      kind: "event_suggestions",
      subject: eventSuggestionsSubject(props),
      email: createElement(EventSuggestions, props),
      payload: { suggestion_ids: found.map((s) => s.id) },
    });
    if (result === "sent") sent++;
  }
  return sent;
}
