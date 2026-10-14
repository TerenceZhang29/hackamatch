import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { listUpcomingEvents } from "@/server/events";
import { NewIdeaForm } from "./NewIdeaForm";

export const metadata: Metadata = { title: "Post an idea · HackaMatch" };

export default async function NewIdeaPage() {
  await requireOnboarded("/ideas/new");
  const events = await listUpcomingEvents();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-12">
      <NewIdeaForm events={events.map(({ id, name }) => ({ id, name }))} />
    </main>
  );
}
