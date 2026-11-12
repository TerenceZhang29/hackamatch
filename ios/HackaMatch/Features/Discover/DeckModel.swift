import Foundation
import Observation

nonisolated struct DeckMatch: Identifiable, Equatable, Sendable {
    let name: String
    let matchId: String
    var id: String { matchId }
}

nonisolated struct UndoablePass: Equatable, Sendable {
    let person: Person
    let token: String
}

/**
 Discover's deck of person cards (P1-24). An answer takes the card off at
 once and is sent behind it; a failed one puts the card back with the
 server's message. Only the last Pass can be undone. When the deck runs low
 it asks for more, leaving out everyone already answered here.
 */
@Observable
final class DeckModel {
    private(set) var cards: [Person] = []
    private(set) var more = false
    private(set) var filterEvents: [FilterEvent] = []
    private(set) var eventSlug: String?
    private(set) var loaded = false
    private(set) var loadError: String?
    private(set) var undoable: UndoablePass?
    /// One line to show, such as "That's 15 today. Back tomorrow."
    var notice: String?
    /// Set when an Interested made it mutual.
    var match: DeckMatch?

    private let service: DeckService
    /// Everyone answered in this session, so a top-up never brings them back.
    private var answered: Set<String> = []

    /// Asks for more cards when this many or fewer are left.
    static let lowWater = 3

    init(service: DeckService) {
        self.service = service
    }

    func load(event: String? = nil) async {
        eventSlug = event
        do {
            let deck = try await service.deck(event: event)
            cards = deck.cards.filter { !answered.contains($0.id) }
            more = deck.more
            filterEvents = deck.filterEvents
            loadError = nil
            undoable = nil
        } catch {
            loadError = Self.message(error)
        }
        loaded = true
    }

    /// The hackathon chips: the same one again clears the filter.
    func select(event slug: String?) async {
        await load(event: slug == eventSlug ? nil : slug)
    }

    func answer(_ response: DeckResponse) async {
        guard let person = cards.first else { return }
        cards.removeFirst()
        undoable = nil
        answered.insert(person.id)
        do {
            let result = try await service.answer(userId: person.id, response: response)
            if response == .pass, let token = result.undoToken {
                undoable = UndoablePass(person: person, token: token)
            }
            if let name = result.matchedName, let id = result.matchId {
                match = DeckMatch(name: name, matchId: id)
            }
        } catch let error as APIError where error.code == "unavailable" {
            // They left the pool, or a block: the card just goes.
        } catch {
            answered.remove(person.id)
            cards.insert(person, at: 0)
            notice = Self.message(error)
        }
        await topUp()
    }

    func undo() async {
        guard let pass = undoable else { return }
        undoable = nil
        do {
            if try await service.undo(token: pass.token) {
                answered.remove(pass.person.id)
                cards.removeAll { $0.id == pass.person.id }
                cards.insert(pass.person, at: 0)
            }
        } catch {
            undoable = pass
            notice = Self.message(error)
        }
    }

    /// After a block or a report: the person is gone for good.
    func remove(_ personId: String) {
        answered.insert(personId)
        cards.removeAll { $0.id == personId }
        if undoable?.person.id == personId { undoable = nil }
    }

    private func topUp() async {
        guard more, cards.count <= Self.lowWater else { return }
        guard let deck = try? await service.deck(event: eventSlug) else { return }
        let shown = Set(cards.map(\.id)).union(answered)
        cards += deck.cards.filter { !shown.contains($0.id) }
        more = deck.more
    }

    private static func message(_ error: Error) -> String {
        (error as? APIError)?.message ?? APIError.unexpected.message
    }
}
