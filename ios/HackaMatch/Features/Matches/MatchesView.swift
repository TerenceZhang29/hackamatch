import SwiftUI

/**
 The Matches tab: "Your hackathons", then Waiting (on the member's answer),
 Mutual and Sent. A mutual match opens the pair page; the others open the
 person's profile. Before a reveal, nobody sees the other person's answer.
 */
struct MatchesView: View {
    enum Tab: String, CaseIterable, Identifiable {
        case waiting, mutual, sent
        var id: String { rawValue }
        var title: String {
            switch self {
            case .waiting: "Waiting"
            case .mutual: "Mutual"
            case .sent: "Sent"
            }
        }
        var empty: String {
            switch self {
            case .waiting: "Nothing waiting"
            case .mutual: "No mutual matches yet"
            case .sent: "Nothing sent yet"
            }
        }
    }

    @Environment(AppModel.self) private var app
    @State private var data: MatchesResponse?
    @State private var error: String?
    @State private var tab: Tab?
    @State private var path = NavigationPath()
    @State private var answering: Set<String> = []

    private func items(_ tab: Tab) -> [MatchItem] {
        data?.matches.filter { $0.section == tab.rawValue } ?? []
    }

    /// The tab asked for, else the first with something in it.
    private var current: Tab {
        tab ?? Tab.allCases.first { !items($0).isEmpty } ?? .waiting
    }

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let hackathons = data?.hackathons, !hackathons.events.isEmpty || !hackathons.sideProjects.isEmpty {
                    Section("Your hackathons") {
                        ForEach(hackathons.events) { event in
                            MyEventRow(event: event, onOpenMatch: open) { choice in
                                Task { await choose(choice, slug: event.slug) }
                            }
                        }
                        ForEach(hackathons.sideProjects) { team in
                            HStack {
                                Label("Side project", systemImage: "hammer")
                                Spacer()
                                Text(team.members.map(\.firstName).formatted(.list(type: .and)))
                                    .foregroundStyle(Theme.muted)
                            }
                            .font(.subheadline)
                        }
                    }
                }
                Section {
                    Picker("Match lists", selection: Binding(get: { current }, set: { tab = $0 })) {
                        ForEach(Tab.allCases) { tab in
                            let count = items(tab).count
                            Text(count > 0 ? "\(tab.title) \(count)" : tab.title).tag(tab)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                    let rows = items(current)
                    if rows.isEmpty, data != nil {
                        ContentUnavailableView {
                            Label(current.empty, systemImage: current == .mutual ? "person.2" : "tray")
                        } actions: {
                            Button("Discover") { app.discover(eventSlug: nil) }
                        }
                        .listRowBackground(Color.clear)
                    }
                    ForEach(rows) { match in
                        MatchRow(
                            match: match, busy: answering.contains(match.id),
                            onOpen: { open(match) },
                            onAnswer: { response in Task { await answer(match, response) } })
                    }
                }
            }
            .navigationTitle("Matches")
            .navigationDestination(for: PairRoute.self) { route in
                PairView(matchId: route.matchId)
            }
            .navigationDestination(for: PersonRoute.self) { route in
                PersonView(personId: route.personId)
            }
            .navigationDestination(for: EventRoute.self) { route in
                EventDetailView(slug: route.slug)
            }
            .overlay {
                if data == nil {
                    if let error {
                        ContentUnavailableView {
                            Label("Couldn't load your matches", systemImage: "wifi.exclamationmark")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Retry") { Task { await load() } }
                        }
                    } else {
                        ProgressView()
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .onChange(of: app.openMatchId) { _, id in openRequested(id) }
            .onAppear { openRequested(app.openMatchId) }
        }
    }

    private func open(_ match: MatchItem) {
        if match.section == "mutual" {
            path.append(PairRoute(matchId: match.id))
        } else {
            path.append(PersonRoute(personId: match.otherId))
        }
    }

    private func open(matchId: String) {
        path.append(PairRoute(matchId: matchId))
    }

    /// "Open match" from Discover's "It's a match!".
    private func openRequested(_ id: String?) {
        guard let id else { return }
        app.openMatchId = nil
        path = NavigationPath()
        path.append(PairRoute(matchId: id))
    }

    private func load() async {
        do {
            data = try await app.api.matches()
            error = nil
            await app.refreshMe()
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }

    private func answer(_ match: MatchItem, _ response: DeckResponse) async {
        answering.insert(match.id)
        defer { answering.remove(match.id) }
        do {
            let revealed = try await app.api.answerMatch(match.id, response)
            await load()
            if revealed {
                app.flash("It's a match! Check your email.", isError: false)
                path.append(PairRoute(matchId: match.id))
            }
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func choose(_ choice: PoolChoice, slug: String) async {
        do {
            _ = try await app.api.setGoing(slug: slug, choice)
            await load()
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }
}

nonisolated struct PairRoute: Hashable, Sendable { let matchId: String }
nonisolated struct PersonRoute: Hashable, Sendable { let personId: String }

/// One match: avatar, name, one line of context, and Pass / Interested while it waits on you.
private struct MatchRow: View {
    let match: MatchItem
    let busy: Bool
    let onOpen: () -> Void
    let onAnswer: (DeckResponse) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onOpen) {
                HStack(spacing: 12) {
                    AvatarView(name: match.otherName, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(match.otherName).font(.headline).foregroundStyle(Theme.ink)
                            if match.isNew { ChipView(label: "New", tone: .accent) }
                            if match.isDemo { ChipView(label: "Demo") }
                        }
                        if let line = match.otherSummary ?? (match.otherTags.isEmpty ? nil : match.otherTags.map(\.label).joined(separator: ", ")) {
                            Text(line).font(.subheadline).foregroundStyle(Theme.muted).lineLimit(1)
                        }
                        if let reason = match.reason {
                            Text(reason).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(match.otherName)
            .accessibilityHint(match.section == "mutual" ? "Opens your match" : "Opens their profile")

            if match.section == "waiting" {
                if busy {
                    ProgressView()
                } else {
                    Button { onAnswer(.pass) } label: {
                        Image(systemName: "xmark").frame(width: 40, height: 40)
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Pass on \(match.otherName)")
                    Button { onAnswer(.interested) } label: {
                        Image(systemName: "heart.fill").frame(width: 40, height: 40)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Interested in \(match.otherName)")
                }
            } else if match.section == "mutual" {
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted).accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
    }
}

/// One hackathon under "Your hackathons": its status, one line about teams, and the keep-matching prompt.
private struct MyEventRow: View {
    let event: MyEvent
    let onOpenMatch: (String) -> Void
    let onChoose: (PoolChoice) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NavigationLink(value: EventRoute(slug: event.slug)) {
                HStack(spacing: 12) {
                    DateTile(isoDate: event.startDate, shared: event.status != "not-going")
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(event.name).font(.headline)
                        Text(event.statusLabel).font(.caption.weight(.semibold))
                            .foregroundStyle(event.status == "not-going" ? Theme.muted : Theme.successInk)
                        Text(event.summary).font(.subheadline).foregroundStyle(Theme.muted)
                    }
                }
            }
            let mates = event.teams.flatMap(\.members).filter { $0.matchId != nil }
                + event.matchedNoTeam.map { TeamMate(id: $0.matchId, firstName: $0.firstName, matchId: $0.matchId) }
            if !mates.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(mates, id: \.id) { mate in
                            ChipView(label: mate.firstName, tone: .accent) {
                                if let id = mate.matchId { onOpenMatch(id) }
                            }
                        }
                    }
                }
            }
            if event.askToKeepMatching {
                KeepMatchingPrompt(eventName: event.name, onChoose: onChoose)
            }
        }
        .padding(.vertical, 4)
    }
}
