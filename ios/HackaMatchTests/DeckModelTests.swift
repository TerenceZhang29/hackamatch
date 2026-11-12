import Foundation
import Testing

@testable import HackaMatch

/// A server stand-in: hands out cards, records answers, and fails on request.
final class FakeDeckService: DeckService {
    var pool: [Person]
    var pageSize: Int
    var answers: [(String, DeckResponse)] = []
    var failNext: APIError?
    var matchWith: Set<String> = []
    private var passed: Set<String> = []

    init(people: Int, pageSize: Int = 30) {
        pool = (1...people).map { Self.person($0) }
        self.pageSize = pageSize
    }

    static func person(_ number: Int) -> Person {
        Person(
            id: "id-\(number)", displayName: "Person \(number)", summary: nil, areas: [], skills: [],
            goingTo: [], isDemo: false)
    }

    func deck(event: String?) async throws -> Deck {
        let answered = Set(answers.map(\.0))
        let left = pool.filter { !answered.contains($0.id) }
        return Deck(
            cards: Array(left.prefix(pageSize)), more: left.count > pageSize, event: event,
            filterEvents: [])
    }

    func answer(userId: String, response: DeckResponse) async throws -> DeckAnswer {
        if let failure = failNext {
            failNext = nil
            throw failure
        }
        answers.append((userId, response))
        if response == .pass {
            passed.insert(userId)
            return DeckAnswer(response: .pass, undoToken: "person:\(userId)", matchId: nil, matchedName: nil)
        }
        let mutual = matchWith.contains(userId)
        return DeckAnswer(
            response: .interested, undoToken: nil, matchId: "match-\(userId)",
            matchedName: mutual ? "Maya" : nil)
    }

    func undo(token: String) async throws -> Bool {
        let id = String(token.dropFirst("person:".count))
        guard passed.remove(id) != nil else { return false }
        answers.removeAll { $0.0 == id }
        return true
    }
}

struct DeckModelTests {
    @Test func answeringTakesTheTopCardAndOnlyAPassCanBeUndone() async {
        let service = FakeDeckService(people: 3)
        let model = DeckModel(service: service)
        await model.load()
        #expect(model.cards.map(\.id) == ["id-1", "id-2", "id-3"])

        await model.answer(.pass)
        #expect(model.cards.map(\.id) == ["id-2", "id-3"])
        #expect(model.undoable?.person.id == "id-1")

        await model.answer(.interested)
        #expect(model.cards.map(\.id) == ["id-3"])
        #expect(model.undoable == nil)
        #expect(service.answers.map(\.1) == [.pass, .interested])
    }

    @Test func undoBringsThePassedCardBackOnTop() async {
        let service = FakeDeckService(people: 3)
        let model = DeckModel(service: service)
        await model.load()
        await model.answer(.pass)
        await model.undo()
        #expect(model.cards.first?.id == "id-1")
        #expect(model.undoable == nil)
        #expect(service.answers.isEmpty)
    }

    @Test func aMutualAnswerShowsTheMatch() async {
        let service = FakeDeckService(people: 2)
        service.matchWith = ["id-1"]
        let model = DeckModel(service: service)
        await model.load()
        await model.answer(.interested)
        #expect(model.match == DeckMatch(name: "Maya", matchId: "match-id-1"))
    }

    @Test func aFailedAnswerPutsTheCardBackWithTheServersMessage() async {
        let service = FakeDeckService(people: 2)
        let model = DeckModel(service: service)
        await model.load()
        service.failNext = APIError(status: 409, code: "daily_limit", message: "That's 15 today. Back tomorrow.")
        await model.answer(.interested)
        #expect(model.cards.first?.id == "id-1")
        #expect(model.notice == "That's 15 today. Back tomorrow.")
    }

    @Test func someoneWhoLeftThePoolJustGoes() async {
        let service = FakeDeckService(people: 2)
        let model = DeckModel(service: service)
        await model.load()
        service.failNext = APIError(status: 409, code: "unavailable", message: "They're not available right now.")
        await model.answer(.interested)
        #expect(model.cards.map(\.id) == ["id-2"])
        #expect(model.notice == nil)
    }

    @Test func aLowDeckIsToppedUpWithoutRepeats() async {
        let service = FakeDeckService(people: 10, pageSize: 4)
        let model = DeckModel(service: service)
        await model.load()
        #expect(model.cards.count == 4)
        #expect(model.more)
        await model.answer(.pass)
        // 3 left is the low-water mark: the next page comes in, minus the cards already showing.
        #expect(model.cards.map(\.id) == ["id-2", "id-3", "id-4", "id-5"])
        await model.answer(.interested)
        await model.answer(.pass)
        #expect(model.cards.map(\.id) == ["id-4", "id-5", "id-6", "id-7"])
        #expect(Set(model.cards.map(\.id)).count == model.cards.count)
    }

    @Test func blockingRemovesThePersonForGood() async {
        let service = FakeDeckService(people: 3)
        let model = DeckModel(service: service)
        await model.load()
        await model.answer(.pass)
        model.remove("id-1")
        model.remove("id-2")
        #expect(model.cards.map(\.id) == ["id-3"])
        #expect(model.undoable == nil)
        await model.load()
        #expect(!model.cards.contains { $0.id == "id-2" })
    }
}

struct SignupModelTests {
    static let taxonomy = Taxonomy(
        areas: [
            Area(slug: "health", label: "Health", featured: true, related: ["mental-health", "fitness"]),
            Area(slug: "mental-health", label: "Mental health", featured: false, related: ["health"]),
            Area(slug: "fitness", label: "Fitness", featured: false, related: ["health"]),
            Area(slug: "climate", label: "Climate", featured: true, related: []),
            Area(slug: "space", label: "Space", featured: false, related: ["climate"]),
            Area(slug: "food", label: "Food", featured: false, related: []),
        ],
        skills: [
            Skill(slug: "frontend", label: "Frontend", group: .technical, featured: true),
            Skill(slug: "react", label: "React", group: .technical, featured: false),
            Skill(slug: "pitching", label: "Pitching", group: .business, featured: true),
            Skill(slug: "ml", label: "Machine learning", group: .technical, featured: true),
        ],
        maxAreas: 2, maxSkills: 3)

    func model(asksEmail: Bool = true) -> SignupModel {
        let model = SignupModel(asksEmail: asksEmail)
        model.load(events: [], taxonomy: Self.taxonomy)
        return model
    }

    @Test func eachStepNeedsAnAnswer() {
        let model = model()
        #expect(!model.canContinue)
        model.toggleUndecided()
        #expect(model.canContinue)
        model.next()
        #expect(model.step == .areas)
        #expect(!model.canContinue)
        model.toggleArea("climate")
        model.next()
        model.toggleSkill("ml")
        model.next()
        #expect(model.step == .details)
        model.firstName = "  Ada "
        #expect(!model.canContinue)
        model.email = "ut-001@cornell.edu"
        #expect(model.canContinue)
        #expect(
            model.answers
                == SignupAnswers(
                    firstName: "Ada", lastName: "", eventIds: [], undecided: true, domains: ["climate"],
                    skills: ["ml"]))
    }

    @Test func undecidedAndHackathonsExcludeEachOther() {
        let model = model()
        model.toggleEvent("e1")
        model.toggleUndecided()
        #expect(model.eventIds.isEmpty)
        model.toggleEvent("e2")
        #expect(!model.undecided)
        #expect(model.answers.eventIds == ["e2"])
    }

    @Test func picksStopAtTheLimit() {
        let model = model()
        model.toggleArea("health")
        model.toggleArea("climate")
        model.toggleArea("space")
        #expect(model.areas == ["health", "climate"])
        model.toggleArea("health")
        #expect(model.areas == ["climate"])
    }

    @Test func areaSearchOffersRelatedAreas() {
        let model = model()
        model.areaQuery = "heal"
        #expect(model.areaSuggestions.map(\.area.slug) == ["health", "mental-health", "fitness"])
        #expect(model.areaSuggestions.map(\.related) == [false, false, true])
        model.areaQuery = "nothing like this"
        #expect(model.areaSuggestions.isEmpty)
        // With nothing typed, areas related to the picks, minus the picks.
        model.areaQuery = ""
        model.toggleArea("health")
        model.toggleArea("fitness")
        #expect(model.areaSuggestions.map(\.area.slug) == ["mental-health"])
        #expect(model.areaChips.map(\.slug) == ["health", "fitness", "climate"])
    }

    @Test func skillChipsKeepOtherPicksInTheirGroup() {
        let model = model()
        model.skillQuery = "rea"
        #expect(model.skillSuggestions.map(\.slug) == ["react"])
        model.toggleSkill("react")
        #expect(model.skillChips(.technical).map(\.slug) == ["frontend", "react", "ml"])
        #expect(model.skillChips(.business).map(\.slug) == ["pitching"])
    }

    @Test func aSignedInMemberNeedsNoEmail() {
        let model = model(asksEmail: false)
        let resumed = SignupModel(
            asksEmail: false,
            resume: SignupAnswers(
                firstName: "Ada", lastName: "L", eventIds: [], undecided: true, domains: ["climate"],
                skills: ["ml"]))
        #expect(resumed.step == .details)
        #expect(resumed.canContinue)
        model.firstName = "Ada"
        model.step = .details
        #expect(model.canContinue)
    }

    @Test func emailsAndNames() {
        #expect(SignupModel.looksLikeEmail("ut-001@cornell.edu"))
        #expect(!SignupModel.looksLikeEmail("ut-001@cornell"))
        #expect(!SignupModel.looksLikeEmail("@cornell.edu"))
        #expect(AvatarView.initials("Maya P.") == "MP")
        #expect(AvatarView.initials("Omar") == "OM")
        #expect(DateText.range("2026-11-11", "2026-11-12") == "Nov 11 – Nov 12")
        #expect(DateText.short("2026-12-05") == "Dec 5")
    }
}
