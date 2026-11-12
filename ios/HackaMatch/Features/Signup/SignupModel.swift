import Foundation
import Observation

/**
 Sign-up's four steps (P1-24, docs/plans/p1-24-redesign.md): hackathons,
 areas, skills, then name (and email, for someone not signed in yet). The
 same rules as the web: at least one hackathon or "Undecided yet", 1 to 5
 areas, 1 to 3 skills, a first name. Searches only pick supported names.
 */
@Observable
final class SignupModel {
    enum Step: Int, CaseIterable {
        case hackathons, areas, skills, details
    }

    var step: Step = .hackathons
    private(set) var events: [EventListItem] = []
    private(set) var taxonomy: Taxonomy?
    private(set) var loadError: String?

    private(set) var eventIds: [String] = []
    private(set) var undecided = false
    private(set) var areas: [String] = []
    private(set) var skills: [String] = []
    var firstName = ""
    var lastName = ""
    var email = ""
    var areaQuery = ""
    var skillQuery = ""

    /// False for someone already signed in: their email is known.
    let asksEmail: Bool

    init(asksEmail: Bool, resume: SignupAnswers? = nil) {
        self.asksEmail = asksEmail
        if let resume {
            eventIds = resume.eventIds
            undecided = resume.undecided
            areas = resume.domains
            skills = resume.skills
            firstName = resume.firstName
            lastName = resume.lastName
            step = .details
        }
    }

    var maxAreas: Int { taxonomy?.maxAreas ?? 5 }
    var maxSkills: Int { taxonomy?.maxSkills ?? 3 }

    func load(events: [EventListItem], taxonomy: Taxonomy) {
        self.events = events
        self.taxonomy = taxonomy
        // A hackathon that has since ended can't stay picked.
        let upcoming = Set(events.map(\.id))
        eventIds = eventIds.filter(upcoming.contains)
        loadError = nil
    }

    func failedToLoad(_ message: String) {
        loadError = message
    }

    // MARK: Step 1

    func toggleEvent(_ id: String) {
        if let index = eventIds.firstIndex(of: id) {
            eventIds.remove(at: index)
        } else {
            eventIds.append(id)
            undecided = false
        }
    }

    func toggleUndecided() {
        undecided.toggle()
        if undecided { eventIds = [] }
    }

    // MARK: Step 2

    func toggleArea(_ slug: String) {
        if let index = areas.firstIndex(of: slug) {
            areas.remove(at: index)
        } else if areas.count < maxAreas {
            areas.append(slug)
        }
    }

    /// The area chips: the featured ones plus any other picked area.
    var areaChips: [Area] {
        guard let all = taxonomy?.areas else { return [] }
        return all.filter { $0.featured || areas.contains($0.slug) }
    }

    /// The areas whose name matches, then the areas related to them; with nothing typed, the areas related to the picks.
    var areaSuggestions: [(area: Area, related: Bool)] {
        guard let all = taxonomy?.areas else { return [] }
        let bySlug = Dictionary(uniqueKeysWithValues: all.map { ($0.slug, $0) })
        let typed = !areaQuery.trimmingCharacters(in: .whitespaces).isEmpty
        let found = typed ? all.filter { Self.matches($0.label, areaQuery) } : []
        let seeds = typed ? found.map(\.slug) : areas
        var related: [String] = []
        for slug in seeds {
            for other in bySlug[slug]?.related ?? [] {
                if found.contains(where: { $0.slug == other }) || related.contains(other) { continue }
                if !typed, areas.contains(other) { continue }
                related.append(other)
            }
        }
        let suggestions =
            found.map { (area: $0, related: false) }
            + related.compactMap { bySlug[$0] }.map { (area: $0, related: true) }
        return Array(suggestions.prefix(8))
    }

    // MARK: Step 3

    func toggleSkill(_ slug: String) {
        if let index = skills.firstIndex(of: slug) {
            skills.remove(at: index)
        } else if skills.count < maxSkills {
            skills.append(slug)
        }
    }

    /// One group's chips: its featured skills plus any other picked skill in it.
    func skillChips(_ group: SkillGroup) -> [Skill] {
        guard let all = taxonomy?.skills else { return [] }
        return all.filter { $0.group == group && ($0.featured || skills.contains($0.slug)) }
    }

    var skillSuggestions: [Skill] {
        guard let all = taxonomy?.skills,
            !skillQuery.trimmingCharacters(in: .whitespaces).isEmpty
        else { return [] }
        return Array(all.filter { Self.matches($0.label, skillQuery) }.prefix(8))
    }

    // MARK: Moving on

    var canContinue: Bool {
        switch step {
        case .hackathons: undecided || !eventIds.isEmpty
        case .areas: !areas.isEmpty
        case .skills: !skills.isEmpty
        case .details: !trimmed(firstName).isEmpty && (!asksEmail || Self.looksLikeEmail(email))
        }
    }

    func next() {
        guard canContinue, let following = Step(rawValue: step.rawValue + 1) else { return }
        step = following
    }

    /// Back one step; false on the first, where leaving sign-up is the caller's call.
    func back() -> Bool {
        guard let previous = Step(rawValue: step.rawValue - 1) else { return false }
        step = previous
        return true
    }

    var answers: SignupAnswers {
        SignupAnswers(
            firstName: trimmed(firstName), lastName: trimmed(lastName),
            eventIds: undecided ? [] : eventIds, undecided: undecided, domains: areas,
            skills: skills)
    }

    var normalizedEmail: String { trimmed(email).lowercased() }

    // MARK: Helpers

    /// True when every word of the query is found in the label, ignoring case (the web's search).
    static func matches(_ label: String, _ query: String) -> Bool {
        let name = label.lowercased()
        let words = query.lowercased().split(whereSeparator: \.isWhitespace)
        return !words.isEmpty && words.allSatisfy { name.contains($0) }
    }

    static func looksLikeEmail(_ value: String) -> Bool {
        let parts = value.trimmingCharacters(in: .whitespaces).split(separator: "@")
        return parts.count == 2 && parts[1].contains(".") && !parts[0].isEmpty
    }

    private func trimmed(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
