import Foundation

// The JSON the server sends (`src/lib/api/schemas.ts`), one type per shape.
// `ios/Fixtures/*.json` are samples of each; HackaMatchTests decodes them all.
// Missing values arrive as `null`, tags carry their label, and dates are ISO
// strings ("2026-11-09" for days).

nonisolated struct Tag: Codable, Hashable, Sendable {
    let slug: String
    let label: String
}

nonisolated struct OK: Codable, Sendable {
    let ok: Bool
}

nonisolated struct APIErrorBody: Codable, Sendable {
    let error: APIErrorDetail
}

nonisolated struct APIErrorDetail: Codable, Sendable {
    let code: String
    let message: String
}

// MARK: Sign-in

nonisolated struct APISession: Codable, Equatable, Sendable {
    let accessToken: String
    let refreshToken: String
    /// When the access token stops working, in seconds since 1970.
    let expiresAt: Int
}

// MARK: Me

nonisolated struct Me: Codable, Equatable, Sendable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    /// How others see the name: "Maya P.".
    let displayName: String
    /// False until the sign-up answers are in.
    let onboarded: Bool
    let summary: String?
    let areas: [Tag]
    let skills: [Tag]
    let eventIds: [String]
    let pause: Pause?
    /// Matches waiting on this member's answer: the Matches tab's badge.
    let waitingCount: Int
}

nonisolated struct Pause: Codable, Equatable, Sendable {
    let until: String
    let label: String
}

/// What sign-up sends, the same four steps as the web.
nonisolated struct SignupAnswers: Codable, Equatable, Sendable {
    var firstName: String
    var lastName: String
    var eventIds: [String]
    var undecided: Bool
    var domains: [String]
    var skills: [String]
}

// MARK: Taxonomy

nonisolated struct Taxonomy: Codable, Sendable {
    let areas: [Area]
    let skills: [Skill]
    let maxAreas: Int
    let maxSkills: Int
}

nonisolated struct Area: Codable, Hashable, Sendable {
    let slug: String
    let label: String
    /// Shown as a chip before any search.
    let featured: Bool
    /// Areas offered alongside this one in the search.
    let related: [String]
}

nonisolated struct Skill: Codable, Hashable, Sendable {
    let slug: String
    let label: String
    let group: SkillGroup
    let featured: Bool
}

nonisolated enum SkillGroup: String, Codable, CaseIterable, Sendable {
    case technical, business
}

// MARK: People and the deck

nonisolated struct Person: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let displayName: String
    let summary: String?
    let areas: [Tag]
    /// Every skill and tool, tools first; a card shows the first three.
    let skills: [Tag]
    /// Upcoming hackathons where they still want a team, the viewer's own first.
    let goingTo: [GoingTo]
    let isDemo: Bool
}

nonisolated struct GoingTo: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let slug: String
    let name: String
    let startDate: String
    /// The viewer is going too.
    let shared: Bool
}

nonisolated struct Deck: Codable, Sendable {
    let cards: [Person]
    /// More people are waiting than this page holds.
    let more: Bool
    let event: String?
    /// The hackathon chips above the deck.
    let filterEvents: [FilterEvent]
}

nonisolated struct FilterEvent: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let slug: String
    let name: String
    let startDate: String
    let going: Bool
}

nonisolated enum DeckResponse: String, Codable, Sendable {
    case interested, pass
}

nonisolated struct DeckAnswer: Codable, Sendable {
    let response: DeckResponse
    /// After a Pass: what Undo takes.
    let undoToken: String?
    let matchId: String?
    /// Set when this answer made the match mutual.
    let matchedName: String?
}

nonisolated struct DeckUndo: Codable, Sendable {
    let undone: Bool
}

nonisolated struct PersonPage: Codable, Sendable {
    let person: Person
    /// none and waiting show Interested and Pass; the other side's answer is never shown.
    let status: String
    let matchId: String?
}

// MARK: Events

nonisolated struct EventsResponse: Codable, Sendable {
    let events: [EventListItem]
}

nonisolated struct EventListItem: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let slug: String
    let name: String
    let startDate: String
    let endDate: String
    let venue: String?
    let format: String?
    let formatLabel: String?
    let lengthHours: Int?
    let entryFeeCents: Int?
    let level: String?
    let levelLabel: String?
    let prizeTotalCents: Int?
    /// Set only while applications are open.
    let applyBy: String?
    let going: Bool
    let goingCount: Int
    /// Members only.
    let needTeamCount: Int?
}

nonisolated struct EventDetail: Codable, Identifiable, Sendable {
    let id: String
    let slug: String
    let name: String
    let description: String?
    let host: String?
    let venue: String?
    let timeLabel: String?
    let url: String?
    let startDate: String
    let endDate: String
    let ended: Bool
    let teamSizeMin: Int?
    let teamSizeMax: Int?
    let areas: [Tag]
    let format: String?
    let formatLabel: String?
    let lengthHours: Int?
    let entryFeeCents: Int?
    let openTo: String?
    let level: String?
    let levelLabel: String?
    let admissionLabel: String?
    let capacity: Int?
    let applyBy: String?
    let apply: ApplyLink?
    let chatUrl: String?
    let prizeTotalCents: Int?
    let prizes: [Prize]
    /// Tracks exist but are for members.
    let tracksLocked: Bool
    let tracks: [Track]
    let tools: String?
    let judging: [JudgingItem]
    let schedule: [ScheduleItem]
    let perks: [Perk]
    let perkNotes: String?
    let detailsUpdatedAt: String?
    let goingCount: Int
    let needTeamCount: Int?
    let faces: [String]
    let topSkills: [SkillCount]
    /// The member's own place in this event's pool.
    let pool: EventPool?
}

nonisolated struct ApplyLink: Codable, Sendable {
    let url: String
    let label: String
}

nonisolated struct Prize: Codable, Sendable {
    let label: String
    let amountCents: Int?
    let note: String?
}

nonisolated struct Track: Codable, Sendable {
    let name: String
    let description: String?
    let skills: [Tag]
}

nonisolated struct JudgingItem: Codable, Sendable {
    let criterion: String
    let weightPct: Double?
}

nonisolated struct ScheduleItem: Codable, Sendable {
    let date: String?
    let time: String?
    let label: String
}

nonisolated struct Perk: Codable, Sendable {
    let key: String
    let label: String
}

nonisolated struct SkillCount: Codable, Sendable {
    let skill: Tag
    let people: Int
}

nonisolated struct EventPool: Codable, Sendable {
    let going: Bool
    /// Going, with a team already.
    let leftPool: Bool
    let matches: [EventMatch]
    let askToKeepMatching: Bool
}

nonisolated struct EventMatch: Codable, Hashable, Sendable {
    let matchId: String
    let firstName: String
}

// MARK: Matches

nonisolated struct MatchesResponse: Codable, Sendable {
    let matches: [MatchItem]
    let hackathons: MyHackathons
}

nonisolated struct MatchItem: Codable, Identifiable, Sendable {
    let id: String
    /// waiting: on the viewer's answer; sent: on the other person's; mutual: revealed.
    let section: String
    let otherId: String
    let otherName: String
    let otherSummary: String?
    let otherTags: [Tag]
    let reason: String?
    let isNew: Bool
    let isDemo: Bool
    let createdAt: String
}

nonisolated struct MyHackathons: Codable, Sendable {
    let events: [MyEvent]
    let sideProjects: [MyTeam]
}

nonisolated struct MyEvent: Codable, Identifiable, Sendable {
    let id: String
    let slug: String
    let name: String
    let startDate: String
    let endDate: String
    let status: String
    let statusLabel: String
    let summary: String
    let askToKeepMatching: Bool
    let teams: [MyTeam]
    let matchedNoTeam: [EventMatch]
}

nonisolated struct MyTeam: Codable, Identifiable, Sendable {
    let id: String
    let members: [TeamMate]
}

nonisolated struct TeamMate: Codable, Identifiable, Sendable {
    let id: String
    let firstName: String
    let matchId: String?
}

nonisolated struct MatchAnswer: Codable, Sendable {
    let revealed: Bool
}

nonisolated struct Pair: Codable, Sendable {
    let matchId: String
    let me: PairMe
    let other: PairOther
    let coffeeChat: String
    let events: [PairEvent]
    let teams: [PairTeam]
}

nonisolated struct PairMe: Codable, Sendable {
    let name: String
    let firstName: String
}

nonisolated struct PairOther: Codable, Sendable {
    let id: String
    let name: String
    let firstName: String
    let email: String
    let summary: String?
    let tags: [Tag]
    let githubUrl: String?
    let linkedinUrl: String?
    let isDemo: Bool
}

nonisolated struct PairEvent: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let startDate: String
    let endDate: String
    let mine: Bool
    let theirs: Bool
    let otherAlreadyTeamed: Bool
    let askToKeepMatching: Bool
}

nonisolated struct PairTeam: Codable, Identifiable, Sendable {
    let id: String
    let eventId: String?
    let eventName: String?
    let members: [PairTeamMember]
}

nonisolated struct PairTeamMember: Codable, Identifiable, Sendable {
    let id: String
    let name: String
}

nonisolated struct TeamUp: Codable, Sendable {
    let created: Bool
    let pair: Pair
}

// MARK: Report and block

nonisolated struct BlocksResponse: Codable, Sendable {
    let blocked: [BlockedPerson]
}

nonisolated struct BlockedPerson: Codable, Identifiable, Sendable {
    let id: String
    let displayName: String
}

nonisolated enum ReportReason: String, Codable, CaseIterable, Identifiable, Sendable {
    case harassment, inappropriate, spam, fake, other

    var id: String { rawValue }

    /// The same wording as the web form.
    var label: String {
        switch self {
        case .harassment: "Harassment or bullying"
        case .inappropriate: "Inappropriate content"
        case .spam: "Spam or advertising"
        case .fake: "Fake profile or impersonation"
        case .other: "Something else"
        }
    }
}
