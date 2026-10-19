# Plan: "Your hackathons" on the matches page

Requested by the owner on 2026-10-19. Status: **plan, decided; not built**.

## The ask
A section on `/matches` that shows, for every hackathon you're involved in, whether you're going, who you've matched with for it, and your team. No clicking into each mutual match to piece it together.

## Today
To see "my team for Fall Hack", a member has to:
1. open `/matches`;
2. find a mutual match;
3. open its pair page (`/matches/<id>`);
4. read that pair's event picks and its teams;
5. repeat for every mutual match.

Nothing lists all of your events in one place. The event page (`/e/<slug>`) shows your matches for that one event, but you have to know to go there.

## Proposed: a compact "Your hackathons" section at the top of `/matches` (placement decided 2026-10-19)
Above "Waiting on you", there's **one line per event**, soonest first, so "Waiting on you" stays near the top. For example:

> **Cornell Tech Fall Hack** · Nov 9–10 · Team with Sofia, Omar · Looking for a team ▸

Each line is a `<details>` element (no JavaScript needed). Tapping it expands the card described below. Exception: when there's a new match to ask about, the line opens by default, so the "Keep matching for <event>?" prompt is visible up front.

The summary line shows the event name, the dates, the team ("Team with Sofia, Omar", or "3 matches, no team yet", or "No matches yet") and your status.

An event is listed if any of these is true:
- you tagged it (going);
- you're on a team for it;
- you have a match for it (both of you picked it on the pair page).

The expanded card shows:
- **The header:** the event name (linking to `/e/<slug>`), its dates, and your status, which is one of:
  - **Looking for a team**: going and in the pool;
  - **Have my team**: going, but you left the pool;
  - **Not marked as going**: you have a match for the event (you both picked it on the pair page) but never tagged it. This comes with an **"I'm going"** button (decided 2026-10-19). Pressing it tags the event, and then the usual "Keep matching?" rules apply.
- **Your team(s) for it:** the members' first names. A name links to your pair page with that person when you have one. People added by a teammate, whom you haven't matched with, show as a name only. Contact details stay on the pair page.
- **Matched for this event, no team yet:** first names, each linking to its pair page. The card says "Pick a team on their page" when you have matches but no team.
- **Nothing yet:** "No matches for this event yet. See who's going →" linking to the event page.
- **Inline actions,** reusing `src/components/EventPool.tsx` with the same rules as the event page:
  - the "Keep matching for <event>?" prompt when there's a new match;
  - "I have my team" and "I'm looking again".
  - "I'm no longer going" stays on the event page, behind its confirmation.

**Side projects:** teams with no event go in a final "Side projects" card, with the same member list.

**Empty state:** "You're not going to any hackathons yet. Browse upcoming hackathons →", linking to `/events`.

## Teaming up marks you as going (decided 2026-10-19)
"We teamed up" for an event on the pair page now also tags that event for **every member of the team who hadn't tagged it**, as going but **out of the pool**:
- they get an `event_interests` row with `left_pool_at = now()`;
- `prompted_matches` is set to their current match count for the event, so they aren't asked about matches the team already covers.

So they count as going for organizer stats, but they aren't listed publicly. They can still choose "I'm looking again" to rejoin the pool.

The same applies when someone is added to a team with "Add" on the pair page (`addTeamMember`).

Members who had already tagged the event are left as they are. If they're still in the pool, the usual "Keep matching?" prompt asks them. This is my reading of "marks you as going with your team": it never takes someone out of a pool they chose to be in. Picking an event with "I'd do this" still doesn't tag it.

This changes `team_up` (SQL, `20261014080000_team_up.sql`) or `teamUp` / `addTeamMember` (`src/server/teams.ts`). Doing it in TypeScript after the RPC keeps it out of a migration. Either way, it is covered by tests.

## Data
One new server function, `listMyEvents(userId)` in `src/server/events.ts`. To keep it to a handful of queries however many events there are, it batches what `listEventMatches` does per event:
1. your `event_interests` rows, including `left_pool_at` and `prompted_matches`;
2. your revealed matches, then all `match_event_votes` for them in one query. This gives the matches for each event;
3. your teams (`team_members` → `teams`), then their members;
4. the names of everyone involved, in one query;
5. the events, upcoming only. Events that have ended are left out (decided 2026-10-19). Past teams stay findable through "Mutual" and each pair page.

`getEventPool` and `listEventMatches` stay for the event page and pair page. They could later use the same batched code.

There's **no migration**. The section only reads tables that exist, through the service client, like the rest of `src/server`. The team-up change is a write in `src/server/teams.ts`. So it costs $0 and needs nothing from production.

## Privacy
You only see people you're already connected to: your own mutual matches, and teams you're on. Names are first names. Emails and links stay on the pair page, where they are today.

## Tests
- **Unit:** the status label for each state (looking, have my team, not marked as going), and the summary line's team text.
- **Database / server:** "We teamed up" for an event tags it as going and out of the pool for a member who hadn't tagged it, leaves a member who had tagged it unchanged, and does nothing for a side project (no event). Adding a member does the same.
- **E2E:**
  - a member going to two events, one with a match and a team and one with nothing, sees both lines with the right summary. Expanding a line shows the status, team names and links;
  - a line with a new match is open by default;
  - the "Keep matching?" prompt on the card works and returns to `/matches`;
  - "I have my team" from the card changes the status;
  - a side-project team shows under "Side projects";
  - a member with a match for an event they never tagged sees "Not marked as going" and an "I'm going" button, and pressing it tags the event;
  - after "We teamed up" for an untagged event, both people show "Have my team" for it, and neither appears in the event's public list;
  - with no events, the empty state links to `/events`;
  - a team for an event that has ended doesn't appear.
- **a11y:** `/matches` with the section is already scanned by `tests/e2e/a11y.spec.ts`; give it data so the cards are checked too.

## Open decisions
1. ~~Where it goes~~: decided, a compact section at the top of `/matches`, one expandable line per event.
2. ~~Past events~~: decided, hidden, matching `/events`. There's no "Past hackathons" list.
3. ~~Not tagged~~: decided, A + C. A match for an untagged event shows an "I'm going" button; teaming up for an event tags it as going and out of the pool.
