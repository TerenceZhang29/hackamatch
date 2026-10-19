import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CardActions, type Viewer } from "@/components/CardActions";
import { Outcome } from "@/components/Outcome";
import { PairStatus } from "@/components/PairStatus";
import { PersonCard } from "@/components/PersonCard";
import { getUser } from "@/lib/auth";
import { firstIdeaPitches, getPublicPerson, poolEventsFor } from "@/server/board";

export const metadata: Metadata = { title: "Builder · HackaMatch" };

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const outcome = await searchParams;
  if (!z.guid().safeParse(id).success) notFound();
  const user = await getUser();
  if (user?.id === id) redirect("/me");

  const person = await getPublicPerson(id);
  const pitch = person ? ((await firstIdeaPitches([id])).get(id) ?? null) : null;
  if (!person) notFound();
  const viewer: Viewer = !user ? "anon" : user.onboarded_at ? "onboarded" : "not-onboarded";

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <Link
        href="/?tab=people"
        aria-label="All builders"
        className="-ml-2 self-start rounded-full p-2 text-muted"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <h1 className="sr-only">{person.display_name}</h1>
      <Outcome params={outcome} />
      <PersonCard
        person={person}
        ideaPitch={pitch}
        lookingEvents={viewer === "onboarded" ? (await poolEventsFor([id])).get(id) : undefined}
        headingLevel={2}
        actions={
          <CardActions
            viewer={viewer}
            cardPath={`/people/${id}`}
            onboarded={
              user ? (
                <PairStatus
                  viewerId={user.id}
                  otherId={id}
                  kind="person"
                  targetId={id}
                  returnTo={`/people/${id}`}
                />
              ) : null
            }
          />
        }
      />
    </main>
  );
}
