import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CardActions, type Viewer } from "@/components/CardActions";
import { Outcome } from "@/components/Outcome";
import { PairStatus } from "@/components/PairStatus";
import { PersonCard } from "@/components/PersonCard";
import { getUser } from "@/lib/auth";
import { getPublicPerson } from "@/server/board";

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
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await getUser();
  if (user?.id === id) redirect("/me");

  const person = await getPublicPerson(id);
  if (!person) notFound();
  const viewer: Viewer = !user ? "anon" : user.onboarded_at ? "onboarded" : "not-onboarded";

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12">
      <Link href="/?tab=people" className="text-sm underline">
        ← All builders
      </Link>
      <Outcome params={outcome} />
      <PersonCard
        person={person}
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
