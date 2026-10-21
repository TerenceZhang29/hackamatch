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
import { demoIds, getPublicPerson, openIdeasOf, poolEventsFor } from "@/server/board";

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
  if (!person) notFound();
  const ideas = await openIdeasOf(id);
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
        ideaCount={ideas.length}
        lookingEvents={viewer === "onboarded" ? (await poolEventsFor([id])).get(id) : undefined}
        isDemo={(await demoIds([id])).users.has(id)}
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
      {ideas.length ? (
        <section id="ideas" aria-labelledby="ideas-heading" className="flex flex-col gap-2">
          <h2 id="ideas-heading" className="text-lg font-semibold">
            {person.display_name}&apos;s ideas
          </h2>
          <ul className="flex flex-col gap-2">
            {ideas.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/ideas/${idea.id}`}
                  className="block rounded-2xl bg-surface px-4 py-3 font-medium hover:underline"
                >
                  {idea.pitch}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
