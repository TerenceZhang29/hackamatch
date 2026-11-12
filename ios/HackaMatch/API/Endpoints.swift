import Foundation

// The routes the Events, Matches and Me tabs use (`src/app/api/v1`).

nonisolated enum PoolChoice: String, Encodable, Sendable {
    case going, notGoing = "not-going", keepLooking = "keep-looking", haveTeam = "have-team"
    case lookingAgain = "looking-again"
}

nonisolated enum PauseChoice: String, Encodable, CaseIterable, Identifiable, Sendable {
    case week, month, indefinite, resume

    var id: String { rawValue }

    var label: String {
        switch self {
        case .week: "For a week"
        case .month: "For a month"
        case .indefinite: "Until I turn it back on"
        case .resume: "Turn matches back on"
        }
    }
}

nonisolated private struct GoingBody: Encodable, Sendable {
    let choice: PoolChoice
    let confirmed: Bool
}
nonisolated private struct MatchAnswerBody: Encodable, Sendable { let response: DeckResponse }
nonisolated private struct VoteBody: Encodable, Sendable {
    let eventId: String
    let on: Bool
}
nonisolated struct TeamUpBody: Encodable, Sendable {
    let eventId: String?

    // `null` must be sent, not left out: it means a side project.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(eventId, forKey: .eventId)
    }

    enum CodingKeys: String, CodingKey { case eventId }
}
nonisolated private struct MemberBody: Encodable, Sendable { let email: String }
nonisolated struct NameEdit: Encodable, Sendable {
    let firstName: String
    let lastName: String
}
nonisolated struct TagsEdit: Encodable, Sendable {
    let areas: [String]
    let skills: [String]
}
nonisolated private struct MePatch: Encodable, Sendable {
    var name: NameEdit?
    var tags: TagsEdit?
    var pause: PauseChoice?
}

extension APIClient {
    // MARK: Events

    func event(slug: String) async throws -> EventDetail {
        try await request(.get, "/events/\(slug)")
    }

    /// Going, not going, keep looking or "I have my team". "Not going" with matches for the event needs `confirmed`.
    func setGoing(slug: String, _ choice: PoolChoice, confirmed: Bool = false) async throws -> EventDetail {
        try await request(.put, "/events/\(slug)/going", body: GoingBody(choice: choice, confirmed: confirmed))
    }

    // MARK: Matches

    func matches() async throws -> MatchesResponse { try await request(.get, "/matches") }

    func pair(matchId: String) async throws -> Pair { try await request(.get, "/matches/\(matchId)") }

    /// Interested or Pass on a match waiting on the member. True when it made the match mutual.
    func answerMatch(_ matchId: String, _ response: DeckResponse) async throws -> Bool {
        let result: MatchAnswer = try await request(
            .post, "/matches/\(matchId)/answer", body: MatchAnswerBody(response: response))
        return result.revealed
    }

    func setPick(matchId: String, eventId: String, on: Bool) async throws -> Pair {
        try await request(.post, "/matches/\(matchId)/hackathons", body: VoteBody(eventId: eventId, on: on))
    }

    /// "We teamed up", for an event or (nil) a side project.
    func teamUp(matchId: String, eventId: String?) async throws -> TeamUp {
        try await request(.post, "/matches/\(matchId)/team", body: TeamUpBody(eventId: eventId))
    }

    func addTeammate(teamId: String, email: String) async throws {
        let _: OK = try await request(.post, "/teams/\(teamId)/members", body: MemberBody(email: email))
    }

    func person(id: String) async throws -> PersonPage { try await request(.get, "/people/\(id)") }

    // MARK: Me

    func updateName(_ name: NameEdit) async throws -> Me {
        try await request(.patch, "/me", body: MePatch(name: name))
    }

    func updateTags(_ tags: TagsEdit) async throws -> Me {
        try await request(.patch, "/me", body: MePatch(tags: tags))
    }

    func setPause(_ choice: PauseChoice) async throws -> Me {
        try await request(.patch, "/me", body: MePatch(pause: choice))
    }

    /// Deletes the account and everything that cascades from it; the session goes with it.
    func deleteAccount() async throws {
        let _: OK = try await request(
            .delete, "/me", query: [URLQueryItem(name: "confirm", value: "delete")])
        clearSession()
    }

    func blocked() async throws -> [BlockedPerson] {
        let response: BlocksResponse = try await request(.get, "/blocks")
        return response.blocked
    }

    func unblock(userId: String) async throws -> [BlockedPerson] {
        let response: BlocksResponse = try await request(.delete, "/blocks/\(userId)")
        return response.blocked
    }
}

/// Money and dates the way the web writes them.
nonisolated enum Format {
    /// 500000 → "$5,000".
    static func dollars(_ cents: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.maximumFractionDigits = 2
        formatter.locale = Locale(identifier: "en_US")
        return "$" + (formatter.string(from: NSNumber(value: Double(cents) / 100)) ?? "0")
    }

    /// 1200000 → "$12k", for list rows; under $1,000 in full.
    static func shortDollars(_ cents: Int) -> String {
        let dollars = Double(cents) / 100
        guard dollars >= 1000 else { return Self.dollars(cents) }
        let thousands = dollars / 1000
        return thousands == thousands.rounded()
            ? "$\(Int(thousands))k" : "$\(String(format: "%.1f", thousands))k"
    }

    /// "Free", "$25 entry", or nil when unknown.
    static func cost(_ cents: Int?) -> String? {
        guard let cents else { return nil }
        return cents == 0 ? "Free" : "\(dollars(cents)) entry"
    }

    /// Today as an ISO day, on this device's calendar.
    static func today(_ now: Date = Date()) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Whole days from `today` to `day`, both ISO days; negative once it has passed.
    static func daysUntil(_ day: String, from today: String) -> Int? {
        let calendar = Calendar(identifier: .gregorian)
        func date(_ iso: String) -> Date? {
            let parts = iso.split(separator: "-").compactMap { Int($0) }
            guard parts.count == 3 else { return nil }
            return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
        }
        guard let start = date(today), let end = date(day) else { return nil }
        return calendar.dateComponents([.day], from: start, to: end).day
    }

    /// "Apply by Nov 28 · 3 days left", or "Applications closed Nov 28".
    static func applyBy(_ day: String, today: String) -> String {
        guard let left = daysUntil(day, from: today) else { return "Apply by \(DateText.short(day))" }
        if left < 0 { return "Applications closed \(DateText.short(day))" }
        let rest = left == 0 ? "last day" : left == 1 ? "1 day left" : "\(left) days left"
        return "Apply by \(DateText.short(day)) · \(rest)"
    }

    /// "2–4 people", or "3 people" when the size is fixed.
    static func teamSize(min: Int?, max: Int?) -> String? {
        switch (min, max) {
        case let (low?, high?): low == high ? "\(low) people" : "\(low)–\(high) people"
        case let (nil, high?): "Up to \(high) people"
        case let (low?, nil): "\(low)+ people"
        default: nil
        }
    }

    /// "https://www.example.com/hack" → "example.com".
    static func host(_ link: String) -> String {
        guard let host = URL(string: link)?.host() else { return link }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}
