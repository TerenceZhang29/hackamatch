"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOnboarded } from "@/lib/auth";
import { addEventInterests, getEventBySlug, hasEnded, removeEventInterest } from "@/server/events";

const schema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(80),
  interested: z.enum(["true", "false"]),
});

/** "I'm interested in this event" on an event page; a plain form post. */
export async function setEventInterestAction(data: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) redirect("/");
  const { slug, interested } = parsed.data;
  const user = await requireOnboarded(`/e/${slug}`);
  const event = await getEventBySlug(slug);
  if (!event) redirect("/");
  if (interested === "true") {
    if (!hasEnded(event)) await addEventInterests(user.id, [event.id]);
  } else {
    await removeEventInterest(user.id, event.id);
  }
  revalidatePath(`/e/${slug}`);
  redirect(`/e/${slug}`);
}
