import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";
import { listUpcomingEvents } from "@/server/events";
import { NewIdeaForm } from "./NewIdeaForm";

export const metadata: Metadata = { title: "Post an idea · HackaMatch" };

export default async function NewIdeaPage() {
  await requireOnboarded("/ideas/new");
  const events = await listUpcomingEvents();
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
      <Link
        href="/"
        aria-label="Back to the board"
        className="-ml-2 self-start rounded-full p-2 text-muted"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <NewIdeaForm events={events.map(({ id, name }) => ({ id, name }))} />
    </main>
  );
}
