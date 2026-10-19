import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { z } from "zod";
import { IdeaTags } from "@/components/IdeaTags";
import { Outcome } from "@/components/Outcome";
import { PairStatus } from "@/components/PairStatus";
import { getUser } from "@/lib/auth";
import { loginPath } from "@/lib/auth-helpers";
import { slugsOf } from "@/lib/taxonomy/skills";
import { getOwnIdea, getPublicIdea, getRevealedIdeaText } from "@/server/ideas";
import { OwnerControls } from "./OwnerControls";

export const metadata: Metadata = { title: "Idea · HackaMatch" };

const STATUS_NOTES = {
  open: null,
  filled: "This idea has a team.",
  archived: "Archived: only you can see this idea.",
} as const;

export default async function IdeaPage({
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

  const own = user ? await getOwnIdea(user.id, id) : null;
  if (own) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <Link
          href="/me"
          aria-label="Your profile"
          className="-ml-2 self-start rounded-full p-2 text-muted"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Link>
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-muted">Your idea</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {own.pitch ?? "Writing your pitch…"}
          </h1>
          {STATUS_NOTES[own.status] ? (
            <p className="text-sm text-muted">{STATUS_NOTES[own.status]}</p>
          ) : null}
        </header>
        <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5">
          <p className="text-sm font-medium text-muted">
            Full text (shown only after a mutual match)
          </p>
          <p className="whitespace-pre-line">{own.raw_text}</p>
        </section>
        <OwnerControls
          ideaId={own.id}
          skillsNeeded={own.skills_needed}
          domain={own.domain}
          scope={own.scope}
          status={own.status}
          question={own.clarifying_question}
          skillSuggestions={slugsOf("skills")}
          domainOptions={slugsOf("domains")}
        />
      </main>
    );
  }

  const idea = await getPublicIdea(id);
  if (!idea) notFound();
  const fullText = user ? await getRevealedIdeaText(user.id, id) : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <Link
        href="/"
        aria-label="All ideas"
        className="-ml-2 self-start rounded-full p-2 text-muted"
      >
        <ArrowLeft aria-hidden="true" className="size-5" />
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted">
          {idea.featured ? "Featured idea · " : "Idea · "}
          {idea.owner_display}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{idea.pitch ?? "New idea"}</h1>
        {STATUS_NOTES[idea.status] ? (
          <p className="text-sm text-muted">{STATUS_NOTES[idea.status]}</p>
        ) : null}
      </header>
      <Outcome params={outcome} />
      <IdeaTags domain={idea.domain} scope={idea.scope} skillsNeeded={idea.skills_needed} />
      {fullText ? (
        <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5">
          <p className="text-sm font-medium text-muted">Full idea</p>
          <p className="whitespace-pre-line">{fullText}</p>
        </section>
      ) : null}
      {user?.onboarded_at ? (
        <PairStatus
          viewerId={user.id}
          otherId={idea.owner_id}
          kind="idea"
          targetId={idea.id}
          returnTo={`/ideas/${id}`}
        />
      ) : user ? (
        <Link href="/onboarding" className="self-start text-sm underline">
          Finish joining to connect
        </Link>
      ) : (
        <Link
          href={loginPath(`/ideas/${id}`)}
          className={buttonClass("primary", "md", "self-start")}
        >
          Sign in to connect
        </Link>
      )}
    </main>
  );
}
