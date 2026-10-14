import Link from "next/link";
import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { describePause, isPaused } from "@/lib/pause";
import { slugsOf } from "@/lib/taxonomy/skills";
import { listEventInterestIds, listUpcomingEvents } from "@/server/events";
import { listOwnIdeas } from "@/server/ideas";
import { getOwnProfile } from "@/server/profiles";
import {
  DeleteSection,
  EventsSection,
  IdeasSection,
  PauseSection,
  RoleSection,
  Section,
  SentenceSection,
  TagsSection,
} from "./sections";

export const metadata: Metadata = { title: "Your profile · HackaMatch" };

export default async function MePage() {
  const user = await requireOnboarded("/me");
  const [profile, ideas, events, interestIds] = await Promise.all([
    getOwnProfile(user.id),
    listOwnIdeas(user.id),
    listUpcomingEvents(),
    listEventInterestIds(user.id),
  ]);
  const pausedLabel = isPaused(user.paused_until)
    ? describePause(user.paused_until!, getConfig().APP_TIMEZONE)
    : null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Your profile</h1>
        {profile.summary ? (
          <p className="text-neutral-600 dark:text-neutral-400">{profile.summary}</p>
        ) : null}
        <nav className="mt-2 flex gap-4 text-sm">
          <Link href="/matches" className="underline">
            Matches
          </Link>
          <Link href="/" className="underline">
            Board
          </Link>
          <Link href="/ideas/new" className="underline">
            Post an idea
          </Link>
        </nav>
      </header>

      <Section title="Your sentence" description="We use it to suggest your tags and find matches.">
        <SentenceSection sentence={user.raw_bio ?? ""} />
      </Section>

      <Section title="Your tags">
        <TagsSection
          tags={{ skills: profile.skills, stack: profile.stack, domains: profile.domains }}
          suggestions={{
            skills: slugsOf("skills"),
            stack: slugsOf("stack"),
            domains: slugsOf("domains"),
          }}
        />
      </Section>

      <Section title="Role and what you're looking for">
        <RoleSection role={user.role!} intents={user.intents} />
      </Section>

      <Section title="Hackathons">
        <EventsSection events={events} selected={interestIds} />
      </Section>

      <Section title="Your ideas">
        {ideas.length ? (
          <IdeasSection
            ideas={ideas.map(({ id, pitch, raw_text, status }) => ({
              id,
              pitch,
              raw_text,
              status,
            }))}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            No ideas yet.{" "}
            <Link href="/ideas/new" className="underline">
              Post one
            </Link>
            .
          </p>
        )}
      </Section>

      <Section
        title="Notifications"
        description={`Matches are emailed to ${user.cornell_email}. Pausing takes you off the board and out of matching; your matches stay.`}
      >
        <PauseSection pausedLabel={pausedLabel} />
      </Section>

      <Section title="Delete account">
        <DeleteSection />
      </Section>

      <form
        action="/logout"
        method="post"
        className="border-t border-neutral-200 pt-6 dark:border-neutral-800"
      >
        <button type="submit" className="text-sm underline">
          Sign out
        </button>
      </form>
    </main>
  );
}
