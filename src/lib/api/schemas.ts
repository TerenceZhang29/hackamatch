import { z } from "zod";
import { PAUSE_CHOICES } from "@/lib/pause";
import { nameFields } from "@/app/(focus)/onboarding/schema";

/**
 * The JSON API for the iOS app (`/api/v1`, docs/plans/ios-app.md): what each
 * route accepts and returns. One contract for both sides: the routes build
 * their responses to these shapes, the browser tests check real responses
 * against them, and `ios/Fixtures/*.json` (checked by a unit test) are the
 * samples the Swift tests decode.
 *
 * Rules that keep the Swift side simple:
 * - objects are strict, so a field can't appear without being added here;
 * - a missing value is `null`, never an absent key;
 * - tags travel with their label, so the app needs no copy of the taxonomy;
 * - dates are ISO strings ("2026-11-09" for days, full timestamps otherwise).
 */

const obj = z.strictObject;
const id = z.guid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Shared pieces -------------------------------------------------------------

/** Every failure: an HTTP status plus a stable code and a line to show. */
export const errorSchema = obj({ error: obj({ code: z.string(), message: z.string() }) });

/** A skill, tool or area, with the name to show. */
export const tagSchema = obj({ slug: z.string(), label: z.string() });
export type ApiTag = z.infer<typeof tagSchema>;

export const okSchema = obj({ ok: z.literal(true) });

// Sign-in -------------------------------------------------------------------

export const authRequestInput = z.object({ email: z.string().max(254) });
export const authVerifyInput = z.object({
  email: z.string().max(254),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/),
});
export const authRefreshInput = z.object({ refreshToken: z.string().min(1).max(2048) });

export const sessionSchema = obj({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** When the access token stops working, in seconds since 1970. */
  expiresAt: z.number().int(),
});
export type ApiSession = z.infer<typeof sessionSchema>;

// Me ------------------------------------------------------------------------

export const meSchema = obj({
  id,
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  /** How others see the name: "Maya P.". */
  displayName: z.string(),
  /** False until sign-up's answers are in; only `/me` and `/signup` work before that. */
  onboarded: z.boolean(),
  summary: z.string().nullable(),
  areas: z.array(tagSchema),
  /** Skills and tools together, as sign-up picks them. */
  skills: z.array(tagSchema),
  /** Upcoming and past events the member marked as going. */
  eventIds: z.array(id),
  pause: obj({ until: z.string(), label: z.string() }).nullable(),
  /** Matches waiting on this member's answer: the Matches tab's badge. */
  waitingCount: z.number().int(),
});
export type ApiMe = z.infer<typeof meSchema>;

const slugList = z.array(z.string().trim().min(1).max(60)).max(30);

/** Any part can be sent alone. */
export const mePatchInput = z.object({
  name: z.object(nameFields).optional(),
  tags: z.object({ areas: slugList, skills: slugList }).optional(),
  pause: z.enum(PAUSE_CHOICES).optional(),
});

// Taxonomy ------------------------------------------------------------------

export const taxonomySchema = obj({
  areas: z.array(
    obj({
      slug: z.string(),
      label: z.string(),
      /** Shown as a chip before any search. */
      featured: z.boolean(),
      /** Areas offered alongside this one in the search. */
      related: z.array(z.string()),
    }),
  ),
  skills: z.array(
    obj({
      slug: z.string(),
      label: z.string(),
      group: z.enum(["technical", "business"]),
      featured: z.boolean(),
    }),
  ),
  maxAreas: z.number().int(),
  maxSkills: z.number().int(),
});
export type ApiTaxonomy = z.infer<typeof taxonomySchema>;

// People and the deck -------------------------------------------------------

export const personSchema = obj({
  id,
  displayName: z.string(),
  summary: z.string().nullable(),
  areas: z.array(tagSchema),
  /** Every skill and tool, tools first; a card shows the first three. */
  skills: z.array(tagSchema),
  /** Upcoming hackathons where they still want a team, the viewer's own first; a card shows the first three. */
  goingTo: z.array(
    obj({ id, slug: z.string(), name: z.string(), startDate: day, shared: z.boolean() }),
  ),
  /** A demo profile for testing, not a real person. */
  isDemo: z.boolean(),
});
export type ApiPerson = z.infer<typeof personSchema>;

export const deckSchema = obj({
  cards: z.array(personSchema),
  /** More people are waiting than this page holds: ask again when it runs out. */
  more: z.boolean(),
  /** The event the deck is narrowed to, if any. */
  event: z.string().nullable(),
  /** The hackathon chips above the deck: the selected one, then the viewer's, then the rest. */
  filterEvents: z.array(
    obj({ id, slug: z.string(), name: z.string(), startDate: day, going: z.boolean() }),
  ),
});
export type ApiDeck = z.infer<typeof deckSchema>;

export const deckAnswerInput = z.object({
  userId: id,
  response: z.enum(["interested", "pass"]),
});

export const deckAnswerSchema = obj({
  response: z.enum(["interested", "pass"]),
  /** After a Pass: what `/deck/undo` takes to bring the card back. */
  undoToken: z.string().nullable(),
  /** After Interested: the pair's match. */
  matchId: id.nullable(),
  /** The other person's first name when this answer made it mutual. */
  matchedName: z.string().nullable(),
});
export type ApiDeckAnswer = z.infer<typeof deckAnswerSchema>;

export const deckUndoInput = z.object({ undoToken: z.string().max(80) });
export const deckUndoSchema = obj({ undone: z.boolean() });

export const personPageSchema = obj({
  person: personSchema,
  /**
   * Where the viewer stands with them. `none` and `waiting` show Interested
   * and Pass. The other person's answer is never revealed before `matched`.
   */
  status: z.enum(["none", "waiting", "sent", "passed", "matched"]),
  /** Set once matched: opens the pair page. */
  matchId: id.nullable(),
});
export type ApiPersonPage = z.infer<typeof personPageSchema>;

// Events --------------------------------------------------------------------

export const eventListItemSchema = obj({
  id,
  slug: z.string(),
  name: z.string(),
  startDate: day,
  endDate: day,
  venue: z.string().nullable(),
  format: z.string().nullable(),
  formatLabel: z.string().nullable(),
  lengthHours: z.number().int().nullable(),
  entryFeeCents: z.number().int().nullable(),
  level: z.string().nullable(),
  levelLabel: z.string().nullable(),
  prizeTotalCents: z.number().int().nullable(),
  /** Set only while applications are still open. */
  applyBy: day.nullable(),
  going: z.boolean(),
  goingCount: z.number().int(),
  /** Members only. */
  needTeamCount: z.number().int().nullable(),
});

export const eventsSchema = obj({ events: z.array(eventListItemSchema) });
export type ApiEvents = z.infer<typeof eventsSchema>;

export const eventPoolSchema = obj({
  going: z.boolean(),
  /** Going, with a team already. */
  leftPool: z.boolean(),
  /** Mutual matches who also picked this event. */
  matches: z.array(obj({ matchId: id, firstName: z.string() })),
  /** A new match since they were last asked "Keep matching?". */
  askToKeepMatching: z.boolean(),
});

export const eventSchema = obj({
  id,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  host: z.string().nullable(),
  venue: z.string().nullable(),
  timeLabel: z.string().nullable(),
  url: z.string().nullable(),
  startDate: day,
  endDate: day,
  ended: z.boolean(),
  teamSizeMin: z.number().int().nullable(),
  teamSizeMax: z.number().int().nullable(),
  areas: z.array(tagSchema),
  format: z.string().nullable(),
  formatLabel: z.string().nullable(),
  lengthHours: z.number().int().nullable(),
  entryFeeCents: z.number().int().nullable(),
  openTo: z.string().nullable(),
  level: z.string().nullable(),
  levelLabel: z.string().nullable(),
  admissionLabel: z.string().nullable(),
  capacity: z.number().int().nullable(),
  applyBy: day.nullable(),
  /** The button to the event's own site, hidden once the event has ended. */
  apply: obj({ url: z.string(), label: z.string() }).nullable(),
  chatUrl: z.string().nullable(),
  prizeTotalCents: z.number().int().nullable(),
  prizes: z.array(
    obj({
      label: z.string(),
      amountCents: z.number().int().nullable(),
      note: z.string().nullable(),
    }),
  ),
  /** Tracks and tools are for members; `tracksLocked` says they exist but are hidden. */
  tracksLocked: z.boolean(),
  tracks: z.array(
    obj({ name: z.string(), description: z.string().nullable(), skills: z.array(tagSchema) }),
  ),
  tools: z.string().nullable(),
  judging: z.array(obj({ criterion: z.string(), weightPct: z.number().nullable() })),
  schedule: z.array(obj({ date: day.nullable(), time: z.string().nullable(), label: z.string() })),
  perks: z.array(obj({ key: z.string(), label: z.string() })),
  perkNotes: z.string().nullable(),
  detailsUpdatedAt: z.string().nullable(),
  goingCount: z.number().int(),
  /** Members only. */
  needTeamCount: z.number().int().nullable(),
  /** A few people going, for avatars; members only. */
  faces: z.array(z.string()),
  /** Skill counts among people going; members only, and only from five people. */
  topSkills: z.array(obj({ skill: tagSchema, people: z.number().int() })),
  /** The member's own place in this event's pool; null for anyone else. */
  pool: eventPoolSchema.nullable(),
});
export type ApiEvent = z.infer<typeof eventSchema>;

export const POOL_CHOICES = [
  "going",
  "not-going",
  "keep-looking",
  "have-team",
  "looking-again",
] as const;

export const eventGoingInput = z.object({
  choice: z.enum(POOL_CHOICES),
  /** "Not going" with matches for the event must be confirmed. */
  confirmed: z.boolean().default(false),
});

// Matches -------------------------------------------------------------------

export const matchItemSchema = obj({
  id,
  /** waiting: on the viewer's answer; sent: on the other person's; mutual: revealed. */
  section: z.enum(["waiting", "mutual", "sent"]),
  otherId: id,
  otherName: z.string(),
  otherSummary: z.string().nullable(),
  otherTags: z.array(tagSchema),
  reason: z.string().nullable(),
  isNew: z.boolean(),
  isDemo: z.boolean(),
  createdAt: z.string(),
});

const teamMateSchema = obj({ id, firstName: z.string(), matchId: id.nullable() });
const myTeamSchema = obj({ id, members: z.array(teamMateSchema) });

export const myEventSchema = obj({
  id,
  slug: z.string(),
  name: z.string(),
  startDate: day,
  endDate: day,
  status: z.enum(["looking", "have-team", "not-going"]),
  statusLabel: z.string(),
  /** One line: "Team with Sofia", "2 matches, no team yet". */
  summary: z.string(),
  askToKeepMatching: z.boolean(),
  teams: z.array(myTeamSchema),
  matchedNoTeam: z.array(obj({ matchId: id, firstName: z.string() })),
});

export const matchesSchema = obj({
  matches: z.array(matchItemSchema),
  hackathons: obj({ events: z.array(myEventSchema), sideProjects: z.array(myTeamSchema) }),
});
export type ApiMatches = z.infer<typeof matchesSchema>;

export const matchAnswerInput = z.object({ response: z.enum(["interested", "pass"]) });
export const matchAnswerSchema = obj({
  /** This answer made the match mutual. */
  revealed: z.boolean(),
});

export const pairSchema = obj({
  matchId: id,
  me: obj({ name: z.string(), firstName: z.string() }),
  /** Contact details: only ever sent for a revealed match the viewer is in. */
  other: obj({
    id,
    name: z.string(),
    firstName: z.string(),
    email: z.string(),
    summary: z.string().nullable(),
    tags: z.array(tagSchema),
    githubUrl: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    isDemo: z.boolean(),
  }),
  /** A suggested first message. */
  coffeeChat: z.string(),
  events: z.array(
    obj({
      id,
      name: z.string(),
      startDate: day,
      endDate: day,
      mine: z.boolean(),
      theirs: z.boolean(),
      otherAlreadyTeamed: z.boolean(),
      askToKeepMatching: z.boolean(),
    }),
  ),
  teams: z.array(
    obj({
      id,
      eventId: id.nullable(),
      eventName: z.string().nullable(),
      members: z.array(obj({ id, name: z.string() })),
    }),
  ),
});
export type ApiPair = z.infer<typeof pairSchema>;

export const pairVoteInput = z.object({ eventId: id, on: z.boolean() });
export const teamUpInput = z.object({ eventId: id.nullable() });
export const teamUpSchema = obj({ created: z.boolean(), pair: pairSchema });
export const teamMemberInput = z.object({ email: z.string().trim().max(254) });

// Report and block -----------------------------------------------------------

/** `POST /reports` takes `reportInput` from src/lib/safety.ts: `{ userId, reason, note }`. */
export const blocksSchema = obj({
  /** The people the caller blocked, newest first, so they can unblock them. */
  blocked: z.array(obj({ id, displayName: z.string() })),
});
export type ApiBlocks = z.infer<typeof blocksSchema>;
