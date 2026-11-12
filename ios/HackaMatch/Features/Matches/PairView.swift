import SwiftUI

/**
 The pair page of a mutual match: who they are and how to reach them, a
 first message to copy or share, the hackathons each would do (both: green),
 "We teamed up", teams and adding a teammate, and Report or block.
 */
struct PairView: View {
    let matchId: String

    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var pair: Pair?
    @State private var error: String?
    @State private var copied = false
    @State private var teamEvent: String = "none"
    @State private var working = false
    @State private var teammateEmail: [String: String] = [:]
    @State private var confirmBlock = false
    @State private var reporting = false

    var body: some View {
        Group {
            if let pair {
                content(pair)
            } else if let error {
                ContentUnavailableView {
                    Label("This match isn't available", systemImage: "person.crop.circle.badge.xmark")
                } description: {
                    Text(error)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.surface)
        .navigationTitle(pair.map { "You and \($0.other.firstName)" } ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let pair {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Report \(pair.other.firstName)", systemImage: "flag") { reporting = true }
                        Button("Block \(pair.other.firstName)", systemImage: "hand.raised", role: .destructive) {
                            confirmBlock = true
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Report or block")
                }
            }
        }
        .confirmationDialog(
            "Block \(pair?.other.firstName ?? "")?", isPresented: $confirmBlock, titleVisibility: .visible
        ) {
            Button("Block", role: .destructive) { Task { await block() } }
        } message: {
            Text("You won't see each other again, and this match closes for both of you.")
        }
        .sheet(isPresented: $reporting) {
            if let pair {
                ReportSheet(userId: pair.other.id, name: pair.other.firstName) {
                    app.flash("Reported and blocked. Thank you.", isError: false)
                    dismiss()
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func content(_ pair: Pair) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if pair.other.isDemo {
                    NoticeBanner(
                        text: "\(pair.other.firstName) is a demo profile for testing: not a real person, and nothing is emailed.",
                        isError: false)
                }
                Card {
                    HStack(spacing: 12) {
                        AvatarView(name: pair.other.name, size: 52)
                        Text(pair.other.name).font(.title3.weight(.bold))
                    }
                    if let summary = pair.other.summary {
                        Text(summary).font(.subheadline)
                    }
                    if !pair.other.tags.isEmpty {
                        TagChips(tags: Array(pair.other.tags.prefix(8)), tone: .accent)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        if let mail = URL(string: "mailto:\(pair.other.email)") {
                            Link(destination: mail) { Label(pair.other.email, systemImage: "envelope") }
                        }
                        if let github = pair.other.githubUrl.flatMap(URL.init(string:)) {
                            Link(destination: github) { Label("GitHub", systemImage: "chevron.left.forwardslash.chevron.right") }
                        }
                        if let linkedin = pair.other.linkedinUrl.flatMap(URL.init(string:)) {
                            Link(destination: linkedin) { Label("LinkedIn", systemImage: "briefcase") }
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                }

                VStack(alignment: .leading, spacing: 12) {
                    SectionLabel(text: "Say hi")
                    Text(pair.coffeeChat).font(.subheadline).foregroundStyle(Theme.accentSoftInk)
                    HStack(spacing: 10) {
                        Button(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc") {
                            UIPasteboard.general.string = pair.coffeeChat
                            copied = true
                        }
                        .buttonStyle(.bordered)
                        ShareLink(item: pair.coffeeChat) { Label("Share", systemImage: "square.and.arrow.up") }
                            .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 22))

                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel(text: "Hackathons").padding(.horizontal, 4)
                    if pair.events.isEmpty {
                        Text("None coming up.").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    ForEach(pair.events) { event in
                        PickRow(event: event, otherName: pair.other.firstName, busy: working) {
                            Task { await pick(event) }
                        } onChoose: { choice in
                            Task { await keepMatching(choice, eventId: event.id) }
                        }
                    }
                }

                Card {
                    SectionLabel(text: "Team")
                    Picker("For which event?", selection: $teamEvent) {
                        ForEach(teamOptions(pair)) { event in
                            Text(event.mine && event.theirs ? "\(event.name) (you both picked it)" : event.name)
                                .tag(event.id)
                        }
                        Text("No event / side project").tag("none")
                    }
                    Button("We teamed up") { Task { await teamUp() } }
                        .buttonStyle(.primary)
                        .disabled(working)
                    ForEach(pair.teams) { team in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(team.eventName ?? "Side project").font(.subheadline.weight(.semibold))
                            Text(team.members.map(\.name).formatted(.list(type: .and)))
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                            HStack {
                                TextField(
                                    "Add a teammate's email",
                                    text: Binding(get: { teammateEmail[team.id] ?? "" }, set: { teammateEmail[team.id] = $0 })
                                )
                                .textFieldStyle(FieldStyle())
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                Button("Add") { Task { await addTeammate(team.id) } }
                                    .buttonStyle(.bordered)
                                    .disabled((teammateEmail[team.id] ?? "").isEmpty)
                            }
                            Text("You can add people you have a mutual match with.")
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                        .padding(14)
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel("Team for \(team.eventName ?? "a side project")")
                    }
                }
            }
            .padding(16)
        }
    }

    /// Events you both picked first, then the rest.
    private func teamOptions(_ pair: Pair) -> [PairEvent] {
        pair.events.filter { $0.mine && $0.theirs } + pair.events.filter { !($0.mine && $0.theirs) }
    }

    private func load() async {
        do {
            let fresh = try await app.api.pair(matchId: matchId)
            if pair == nil {
                teamEvent = fresh.events.first { $0.mine && $0.theirs }?.id ?? "none"
            }
            pair = fresh
            error = nil
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }

    private func pick(_ event: PairEvent) async {
        working = true
        defer { working = false }
        do {
            pair = try await app.api.setPick(matchId: matchId, eventId: event.id, on: !event.mine)
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func keepMatching(_ choice: PoolChoice, eventId: String) async {
        guard let slug = try? await app.api.events().first(where: { $0.id == eventId })?.slug else { return }
        _ = try? await app.api.setGoing(slug: slug, choice)
        await load()
    }

    private func teamUp() async {
        working = true
        defer { working = false }
        do {
            let result = try await app.api.teamUp(matchId: matchId, eventId: teamEvent == "none" ? nil : teamEvent)
            pair = result.pair
            app.flash(result.created ? "Team saved. Good luck!" : "You're already a team for that.", isError: false)
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func addTeammate(_ teamId: String) async {
        let email = (teammateEmail[teamId] ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        do {
            try await app.api.addTeammate(teamId: teamId, email: email)
            teammateEmail[teamId] = ""
            app.flash("Added to your team.", isError: false)
            await load()
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }

    private func block() async {
        guard let pair else { return }
        do {
            try await app.api.block(userId: pair.other.id)
            app.flash("Blocked. You won't see each other again.", isError: false)
            dismiss()
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }
}

/// One upcoming hackathon on the pair page: green when you both would, with "I'd do this".
private struct PickRow: View {
    let event: PairEvent
    let otherName: String
    let busy: Bool
    let onToggle: () -> Void
    let onChoose: (PoolChoice) -> Void

    var body: some View {
        let both = event.mine && event.theirs
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.name).font(.subheadline.weight(.semibold))
                    Text(
                        DateText.range(event.startDate, event.endDate)
                            + (!both && event.theirs ? " · \(otherName) would" : "")
                    )
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    if both {
                        ChipView(label: "You both want this", tone: .success)
                    }
                    if event.otherAlreadyTeamed {
                        ChipView(label: "\(otherName) has a team")
                    }
                }
                Spacer()
                Button(event.mine ? "I'd do it" : "I'd do this", action: onToggle)
                    .buttonStyle(event.mine ? AnyPrimitiveButtonStyle(.borderedProminent) : AnyPrimitiveButtonStyle(.bordered))
                    .disabled(busy)
                    .accessibilityAddTraits(event.mine ? .isSelected : [])
            }
            if event.askToKeepMatching {
                KeepMatchingPrompt(eventName: event.name, onChoose: onChoose)
            }
        }
        .padding(14)
        .background(both ? Theme.successSoft : Theme.bg, in: RoundedRectangle(cornerRadius: 18))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(event.name)
    }
}

/// Lets one button switch between two system styles.
struct AnyPrimitiveButtonStyle: PrimitiveButtonStyle {
    private let make: (Configuration) -> AnyView

    init<S: PrimitiveButtonStyle>(_ style: S) {
        make = { AnyView(style.makeBody(configuration: $0)) }
    }

    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}
