import { LogOut } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClass } from "@/components/ui/Button";
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
  NameSection,
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
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="sr-only">Your profile</h1>
      <header className="flex items-center gap-4">
        <Avatar name={user.name?.trim() || "Cornell student"} size={72} />
        <div className="flex min-w-0 flex-col gap-1">
          {user.name ? (
            <p className="text-2xl font-bold tracking-tight">{user.name}</p>
          ) : (
            <a href="#me-name" className="text-lg font-semibold text-accent underline">
              Add your name
            </a>
          )}
          {profile.summary ? <p className="text-sm text-muted">{profile.summary}</p> : null}
        </div>
      </header>

      <Section title="Your name">
        <NameSection name={user.name ?? ""} />
      </Section>

      <Section title="Your sentence">
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
          <p className="text-sm text-muted">
            No ideas yet.{" "}
            <Link href="/ideas/new" className="underline">
              Post one
            </Link>
            .
          </p>
        )}
      </Section>

      <Section title="Notifications" description={`Emails go to ${user.cornell_email}.`}>
        <PauseSection pausedLabel={pausedLabel} />
      </Section>

      <Section title="Delete account">
        <DeleteSection />
      </Section>

      <form action="/logout" method="post">
        <button type="submit" className={buttonClass("secondary", "md", "w-full")}>
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </button>
      </form>
    </main>
  );
}
