import Foundation
import Testing

@testable import HackaMatch

/**
 The server's sample responses (`ios/Fixtures`, checked against the server's
 schemas by `tests/unit/api-contract.test.ts`) decode into the app's models.
 A field renamed or retyped on either side fails here.
 */
struct FixtureTests {
    static let directory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "Fixtures")

    static let files = [
        "blocks.json", "deck-answer-match.json", "deck-answer-pass.json", "deck-undo.json",
        "deck.json", "error.json", "event-visitor.json", "event.json", "events.json",
        "match-answer.json", "matches.json", "me-new.json", "me.json", "ok.json", "pair.json",
        "person-page.json", "session.json", "taxonomy.json", "team-up.json",
    ]

    func decode<T: Decodable>(_ type: T.Type, _ file: String) throws -> T {
        let data = try Data(contentsOf: Self.directory.appending(path: file))
        return try JSONDecoder().decode(T.self, from: data)
    }

    @Test func everySampleIsDecodedHere() throws {
        let present = try FileManager.default.contentsOfDirectory(atPath: Self.directory.path)
            .filter { $0.hasSuffix(".json") }.sorted()
        #expect(present == Self.files)
    }

    @Test func signInAndMe() throws {
        let session = try decode(APISession.self, "session.json")
        #expect(session.expiresAt == 1_794_000_000)
        let me = try decode(Me.self, "me.json")
        #expect(me.displayName == "Sam L.")
        #expect(me.onboarded)
        #expect(me.pause?.label == "Paused until Dec 1")
        #expect(me.skills.map(\.label) == ["React", "Machine learning"])
        let fresh = try decode(Me.self, "me-new.json")
        #expect(!fresh.onboarded)
        #expect(fresh.summary == nil)
        #expect(fresh.pause == nil)
        #expect(try decode(OK.self, "ok.json").ok)
    }

    @Test func errors() throws {
        let body = try decode(APIErrorBody.self, "error.json")
        #expect(body.error.code == "daily_limit")
        #expect(body.error.message == "That's 15 today. Back tomorrow.")
    }

    @Test func taxonomy() throws {
        let taxonomy = try decode(Taxonomy.self, "taxonomy.json")
        #expect(taxonomy.maxAreas == 5)
        #expect(taxonomy.maxSkills == 3)
        #expect(taxonomy.areas.first?.related == ["mental-health", "fitness"])
        #expect(taxonomy.skills.map(\.group) == [.technical, .business, .technical])
    }

    @Test func deck() throws {
        let deck = try decode(Deck.self, "deck.json")
        #expect(deck.cards.count == 2)
        #expect(deck.more)
        #expect(deck.event == "fall-hack")
        #expect(deck.cards[0].goingTo.first?.shared == true)
        #expect(deck.cards[1].summary == nil)
        #expect(deck.cards[1].isDemo)
        #expect(deck.filterEvents.map(\.going) == [true, false])

        let pass = try decode(DeckAnswer.self, "deck-answer-pass.json")
        #expect(pass.response == .pass)
        #expect(pass.undoToken?.hasPrefix("person:") == true)
        #expect(pass.matchedName == nil)
        let match = try decode(DeckAnswer.self, "deck-answer-match.json")
        #expect(match.matchedName == "Maya")
        #expect(match.undoToken == nil)
        #expect(try decode(DeckUndo.self, "deck-undo.json").undone)

        let page = try decode(PersonPage.self, "person-page.json")
        #expect(page.status == "matched")
        #expect(page.matchId != nil)
    }

    @Test func events() throws {
        let list = try decode(EventsResponse.self, "events.json").events
        #expect(list.count == 2)
        #expect(list[0].formatLabel == "In person")
        #expect(list[1].needTeamCount == nil)

        let event = try decode(EventDetail.self, "event.json")
        #expect(event.apply?.label == "Apply on the event site")
        #expect(event.prizes[1].amountCents == nil)
        #expect(event.judging[0].weightPct == 30)
        #expect(event.schedule[1].date == nil)
        #expect(event.topSkills.first?.skill.label == "React")
        #expect(event.pool?.matches.first?.firstName == "Maya")

        let visitor = try decode(EventDetail.self, "event-visitor.json")
        #expect(visitor.tracksLocked)
        #expect(visitor.pool == nil)
        #expect(visitor.apply == nil)
    }

    @Test func matchesAndPair() throws {
        let matches = try decode(MatchesResponse.self, "matches.json")
        #expect(matches.matches.map(\.section) == ["waiting", "mutual", "sent"])
        #expect(matches.hackathons.events.first?.summary == "Team with Maya · 1 more match")
        #expect(matches.hackathons.sideProjects.first?.members.first?.matchId == nil)

        let pair = try decode(Pair.self, "pair.json")
        #expect(pair.other.email == "seed-101@cornell.edu")
        #expect(pair.other.linkedinUrl == nil)
        #expect(pair.teams[1].eventId == nil)
        #expect(try decode(TeamUp.self, "team-up.json").created)
        #expect(try decode(MatchAnswer.self, "match-answer.json").revealed)
    }

    @Test func blocks() throws {
        let blocks = try decode(BlocksResponse.self, "blocks.json")
        #expect(blocks.blocked.map(\.displayName) == ["Omar", "Lee C."])
    }

    @Test func requestBodiesUseTheServersNames() throws {
        let answers = SignupAnswers(
            firstName: "Ada", lastName: "", eventIds: [], undecided: true, domains: ["climate"],
            skills: ["ml"])
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(answers)) as? [String: Any]
        #expect(
            Set(json?.keys.map { $0 } ?? [])
                == ["firstName", "lastName", "eventIds", "undecided", "domains", "skills"])
        #expect(ReportReason.allCases.map(\.rawValue) == ["harassment", "inappropriate", "spam", "fake", "other"])
    }
}
