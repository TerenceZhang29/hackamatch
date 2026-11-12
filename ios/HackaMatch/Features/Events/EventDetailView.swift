import SwiftUI

/**
 An event's page (P1-24, P1-25), in the web's order: the header, at a glance
 with apply-by, the member's place in the pool, tracks, who's going, prizes,
 judging, schedule and what's included, each hidden when empty. "I'm going!"
 and "Discover who's going" stay at the bottom while it scrolls.
 */
struct EventDetailView: View {
    let slug: String

    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var event: EventDetail?
    @State private var error: String?
    @State private var working = false
    @State private var confirmNotGoing = false

    var body: some View {
        Group {
            if let event {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header(event)
                        glance(event)
                        if let pool = event.pool, pool.going, !event.ended {
                            poolPanel(event, pool)
                        }
                        tracks(event)
                        whosGoing(event)
                        prizes(event)
                        judging(event)
                        schedule(event)
                        included(event)
                        if let updated = event.detailsUpdatedAt {
                            Text("Details from the organizer's site, updated \(DateText.short(String(updated.prefix(10))))")
                                .font(.footnote)
                                .foregroundStyle(Theme.muted)
                        }
                        if event.ended {
                            ChipView(label: "This event has ended.")
                        }
                    }
                    .padding(16)
                }
                .safeAreaInset(edge: .bottom) {
                    if !event.ended { actions(event) }
                }
            } else if let error {
                ContentUnavailableView {
                    Label("Couldn't load this hackathon", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.surface)
        .navigationTitle(event?.name ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .task { if event == nil { await load() } }
        .refreshable { await load() }
        .confirmationDialog(
            "Not going to \(event?.name ?? "this hackathon")?", isPresented: $confirmNotGoing,
            titleVisibility: .visible
        ) {
            Button("I'm not going", role: .destructive) {
                Task { await choose(.notGoing, confirmed: true) }
            }
        } message: {
            Text("You've matched with people for it. They'll still be your matches.")
        }
    }

    // MARK: Sections

    private func header(_ event: EventDetail) -> some View {
        let going = event.pool?.going ?? false
        return Card(outline: going) {
            HStack(alignment: .top, spacing: 14) {
                DateTile(isoDate: event.startDate, shared: going)
                    .scaleEffect(1.15)
                    .padding(4)
                    .background(going ? Theme.successSoft : Theme.accentSoft, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(event.name)
                        .font(.title2.weight(.heavy))
                        .accessibilityAddTraits(.isHeader)
                    if let host = event.host {
                        Text("Hosted by \(host)").font(.subheadline).foregroundStyle(Theme.muted)
                    }
                    if going {
                        Label("You're going", systemImage: "checkmark")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.successInk)
                    }
                }
            }
            if let description = event.description {
                Text(description).font(.body)
            }
            if !event.areas.isEmpty {
                TagChips(tags: event.areas)
            }
        }
    }

    private func glance(_ event: EventDetail) -> some View {
        Card {
            SectionLabel(text: "At a glance")
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)], spacing: 14) {
                Fact(icon: "clock", label: "When", value: DateText.range(event.startDate, event.endDate), note: event.timeLabel)
                if event.formatLabel != nil || event.venue != nil {
                    Fact(
                        icon: "mappin.and.ellipse", label: "Where", value: event.formatLabel ?? event.venue ?? "",
                        note: event.formatLabel != nil ? event.venue : nil)
                }
                if let teams = Format.teamSize(min: event.teamSizeMin, max: event.teamSizeMax) {
                    Fact(
                        icon: "person.3", label: "Teams", value: teams,
                        note: event.lengthHours.map { "\($0) hours of hacking" })
                }
                if let cost = Format.cost(event.entryFeeCents) {
                    Fact(icon: "tag", label: "Cost", value: cost)
                }
                if let openTo = event.openTo {
                    Fact(icon: "graduationcap", label: "Open to", value: openTo)
                }
                if let level = event.levelLabel {
                    Fact(icon: "leaf", label: "Level", value: level)
                }
                if let site = event.url, let url = URL(string: site) {
                    LinkFact(icon: "globe", label: "Event site", url: url)
                }
                if let chat = event.chatUrl, let url = URL(string: chat) {
                    LinkFact(icon: "bubble.left", label: "Chat", url: url)
                }
            }
            if let applyBy = event.applyBy {
                let closed = (Format.daysUntil(applyBy, from: Format.today()) ?? 0) < 0
                VStack(alignment: .leading, spacing: 10) {
                    Label(Format.applyBy(applyBy, today: Format.today()), systemImage: "calendar.badge.clock")
                        .font(.subheadline.weight(.bold))
                    let extra = [event.capacity.map { "\($0.formatted()) spots" }, event.admissionLabel].compactMap { $0 }
                    if !extra.isEmpty {
                        Text(extra.joined(separator: " · ")).font(.footnote)
                    }
                    if let apply = event.apply, !closed, let url = URL(string: apply.url) {
                        Button {
                            openURL(url)
                        } label: {
                            Label(apply.label, systemImage: "arrow.up.right.square")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(14)
                .foregroundStyle(Color(light: 0x78350f, dark: 0xfde68a))
                .background(Color(light: 0xfef3c7, dark: 0x451a03), in: RoundedRectangle(cornerRadius: 16))
            } else if let apply = event.apply, let url = URL(string: apply.url) {
                Button {
                    openURL(url)
                } label: {
                    Label(apply.label, systemImage: "arrow.up.right.square")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    private func poolPanel(_ event: EventDetail, _ pool: EventPool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "checkmark")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Color(light: 0x16a34a, dark: 0x16a34a), in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("You're going!").font(.headline)
                    Text(pool.leftPool ? "You have your team for this hackathon." : "You're in the pool for this hackathon.")
                        .font(.footnote)
                }
                Spacer()
                Button("Not going?") {
                    if pool.matches.isEmpty {
                        Task { await choose(.notGoing) }
                    } else {
                        confirmNotGoing = true
                    }
                }
                .font(.subheadline.weight(.semibold))
                .underline()
            }
            .foregroundStyle(Theme.successInk)
            .padding(14)
            .background(Theme.successSoft, in: RoundedRectangle(cornerRadius: 16))
            .accessibilityElement(children: .contain)

            if pool.askToKeepMatching {
                KeepMatchingPrompt(eventName: event.name) { choice in
                    Task { await choose(choice) }
                }
            } else if !pool.matches.isEmpty {
                HStack {
                    Text(
                        pool.leftPool
                            ? "Want more teammates?" : "Matched with \(pool.matches.map(\.firstName).formatted(.list(type: .and)))"
                    )
                    .font(.subheadline)
                    Spacer()
                    Button(pool.leftPool ? "Keep matching" : "I have my team") {
                        Task { await choose(pool.leftPool ? .lookingAgain : .haveTeam) }
                    }
                    .buttonStyle(.bordered)
                }
                .padding(14)
                .background(Theme.bg, in: RoundedRectangle(cornerRadius: 16))
            }
        }
    }

    @ViewBuilder private func tracks(_ event: EventDetail) -> some View {
        if event.tracksLocked {
            Card {
                SectionLabel(text: "Tracks")
                Label("Join to see the tracks and details", systemImage: "lock")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
        } else if !event.tracks.isEmpty || event.tools != nil {
            VStack(alignment: .leading, spacing: 10) {
                SectionLabel(text: "Tracks").padding(.horizontal, 4)
                ForEach(event.tracks, id: \.name) { track in
                    Card {
                        Text(track.name).font(.headline)
                        if let description = track.description {
                            Text(description).font(.subheadline).foregroundStyle(Theme.muted)
                        }
                        if !track.skills.isEmpty {
                            Text("Skills that help").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                            TagChips(tags: track.skills, tone: .accent)
                        }
                    }
                }
                if let tools = event.tools {
                    Card {
                        Text("Tools provided").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                        Text(tools).font(.subheadline)
                    }
                }
            }
        }
    }

    @ViewBuilder private func whosGoing(_ event: EventDetail) -> some View {
        // Hidden while nobody on HackaMatch is going (owner, 2026-11-03).
        if event.goingCount > 0 {
            Card {
                SectionLabel(text: "Who's going on HackaMatch")
                HStack(spacing: 12) {
                    if !event.faces.isEmpty {
                        HStack(spacing: -8) {
                            ForEach(event.faces, id: \.self) { name in
                                AvatarView(name: name, size: 32)
                                    .overlay(Circle().stroke(Theme.bg, lineWidth: 2))
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        let mine = event.pool?.going == true ? ", including you" : ""
                        Text("\(event.goingCount) \(event.goingCount == 1 ? "person" : "people") going\(mine)")
                            .font(.headline)
                        if let need = event.needTeamCount {
                            Text("\(need) still need a team").font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                }
                if !event.topSkills.isEmpty {
                    let most = event.topSkills.map(\.people).max() ?? 1
                    VStack(spacing: 8) {
                        ForEach(event.topSkills, id: \.skill.slug) { row in
                            HStack {
                                Text(row.skill.label).font(.subheadline).frame(width: 130, alignment: .leading)
                                GeometryReader { proxy in
                                    Capsule().fill(Theme.accent)
                                        .frame(width: max(8, proxy.size.width * CGFloat(row.people) / CGFloat(most)))
                                }
                                .frame(height: 8)
                                Text("\(row.people)").font(.footnote).foregroundStyle(Theme.muted)
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(row.skill.label): \(row.people)")
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func prizes(_ event: EventDetail) -> some View {
        if !event.prizes.isEmpty || event.prizeTotalCents != nil {
            Card {
                HStack {
                    SectionLabel(text: "Prizes")
                    Spacer()
                    if let total = event.prizeTotalCents {
                        Text("\(Format.dollars(total)) total").font(.subheadline.weight(.semibold))
                    }
                }
                ForEach(Array(event.prizes.enumerated()), id: \.offset) { _, prize in
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(prize.label).font(.subheadline.weight(.semibold))
                            if let note = prize.note {
                                Text(note).font(.footnote).foregroundStyle(Theme.muted)
                            }
                        }
                        Spacer()
                        if let amount = prize.amountCents {
                            Text(Format.dollars(amount)).font(.subheadline.weight(.bold))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func judging(_ event: EventDetail) -> some View {
        if !event.judging.isEmpty {
            Card {
                SectionLabel(text: "How it's judged")
                ForEach(event.judging, id: \.criterion) { item in
                    HStack {
                        Text(item.criterion).font(.subheadline)
                        Spacer()
                        if let weight = item.weightPct {
                            Text("\(Int(weight))%").font(.subheadline.weight(.semibold))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func schedule(_ event: EventDetail) -> some View {
        if !event.schedule.isEmpty {
            Card {
                SectionLabel(text: "Schedule")
                ForEach(Array(event.schedule.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text([item.date.map(DateText.short), item.time].compactMap { $0 }.joined(separator: " · "))
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                            .frame(width: 110, alignment: .leading)
                        Text(item.label).font(.subheadline)
                    }
                }
            }
        }
    }

    @ViewBuilder private func included(_ event: EventDetail) -> some View {
        if !event.perks.isEmpty || event.perkNotes != nil {
            Card {
                SectionLabel(text: "What's included")
                FlowLayout(spacing: 6) {
                    ForEach(event.perks, id: \.key) { ChipView(label: $0.label, tone: .success) }
                }
                if let notes = event.perkNotes {
                    Text(notes).font(.footnote).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    private func actions(_ event: EventDetail) -> some View {
        HStack(spacing: 10) {
            if event.pool?.going != true {
                Button {
                    Task { await choose(.going) }
                } label: {
                    Text("I'm going!")
                        .font(.headline)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 52)
                        .foregroundStyle(Theme.successInk)
                        .background(Theme.bg, in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(light: 0x16a34a, dark: 0x22c55e), lineWidth: 2))
                }
                .buttonStyle(.plain)
                .disabled(working)
            }
            Button {
                app.discover(eventSlug: event.slug)
            } label: {
                Label("Discover who's going", systemImage: "arrow.right")
                    .labelStyle(TrailingIconLabelStyle())
            }
            .buttonStyle(.primary)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.bar)
    }

    // MARK: Actions

    private func load() async {
        do {
            event = try await app.api.event(slug: slug)
            error = nil
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }

    private func choose(_ choice: PoolChoice, confirmed: Bool = false) async {
        working = true
        defer { working = false }
        do {
            event = try await app.api.setGoing(slug: slug, choice, confirmed: confirmed)
            await app.refreshMe()
        } catch let error as APIError where error.code == "confirm_needed" {
            confirmNotGoing = true
        } catch {
            app.flash((error as? APIError)?.message ?? APIError.unexpected.message)
        }
    }
}

/// "Keep matching for Fall Hack?", asked once per new match for an event.
struct KeepMatchingPrompt: View {
    let eventName: String
    let onChoose: (PoolChoice) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Keep matching for \(eventName)?")
                .font(.headline)
                .foregroundStyle(Theme.accentSoftInk)
            HStack(spacing: 10) {
                Button("Keep looking") { onChoose(.keepLooking) }
                    .buttonStyle(.bordered)
                Button("I have my team") { onChoose(.haveTeam) }
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Keep matching for \(eventName)?")
    }
}

/// A white card on the grey page, as on the web's event page.
struct Card<Content: View>: View {
    var outline = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(Theme.bg, in: RoundedRectangle(cornerRadius: 22))
            .overlay(
                RoundedRectangle(cornerRadius: 22).stroke(outline ? Theme.successLine : .clear, lineWidth: 2))
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }
}

private struct Fact: View {
    let icon: String
    let label: String
    let value: String
    var note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(label, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
            Text(value).font(.subheadline.weight(.semibold))
            if let note {
                Text(note).font(.caption).foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct LinkFact: View {
    let icon: String
    let label: String
    let url: URL

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(label, systemImage: icon)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
            Link(Format.host(url.absoluteString), destination: url)
                .font(.subheadline.weight(.semibold))
        }
    }
}
