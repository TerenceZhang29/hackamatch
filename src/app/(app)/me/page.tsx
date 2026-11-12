import { LogOut } from "lucide-react";
import { LegalLinks } from "@/components/LegalLinks";
import { Avatar } from "@/components/ui/Avatar";
import { buttonClass } from "@/components/ui/Button";
import type { Metadata } from "next";
import { requireOnboarded } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { describePause, isPaused } from "@/lib/pause";
import { slugsOf } from "@/lib/taxonomy/skills";
import { listEventInterestIds, listUpcomingEvents } from "@/server/events";
import { getOwnProfile } from "@/server/profiles";
import { listBlocked } from "@/server/safety";
import { unblockAction } from "@/app/actions/safety";
import {
  DeleteSection,
  EventsSection,
  NameSection,
  PauseSection,
  Section,
  TagsSection,
} from "./sections";

export const metadata: Metadata = { title: "Your profile · HackaMatch" };

export default async function MePage() {
  const user = await requireOnboarded("/me");
  const [profile, events, interestIds, blocked] = await Promise.all([
    getOwnProfile(user.id),
    listUpcomingEvents(),
    listEventInterestIds(user.id),
    listBlocked(user.id),
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
            <a href="#me-first-name" className="text-lg font-semibold text-accent underline">
              Add your name
            </a>
          )}
          {profile.summary ? <p className="text-sm text-muted">{profile.summary}</p> : null}
        </div>
      </header>

      <Section title="Your name">
        <NameSection name={user.name ?? ""} />
      </Section>

      <Section title="Your areas and skills">
        <TagsSection
          tags={{ skills: profile.skills, stack: profile.stack, domains: profile.domains }}
          suggestions={{
            skills: slugsOf("skills"),
            stack: slugsOf("stack"),
            domains: slugsOf("domains"),
          }}
        />
      </Section>

      <Section title="Hackathons">
        <EventsSection events={events} selected={interestIds} />
      </Section>

      <Section title="Notifications" description={`Emails go to ${user.cornell_email}.`}>
        <PauseSection pausedLabel={pausedLabel} />
      </Section>

      {blocked.length ? (
        <Section title="Blocked people">
          <ul className="flex flex-col gap-2">
            {blocked.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{person.displayName}</span>
                <form action={unblockAction}>
                  <input type="hidden" name="userId" value={person.id} />
                  <button
                    type="submit"
                    aria-label={`Unblock ${person.displayName}`}
                    className={buttonClass("outline", "sm")}
                  >
                    Unblock
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Delete account">
        <DeleteSection />
      </Section>

      <form action="/logout" method="post">
        <button type="submit" className={buttonClass("secondary", "md", "w-full")}>
          <LogOut aria-hidden="true" className="size-4" />
          Sign out
        </button>
      </form>
      <LegalLinks />
    </main>
  );
}
