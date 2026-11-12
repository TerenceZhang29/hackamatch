import SwiftUI

/**
 Every upcoming hackathon (P1-24, P1-25): the ones the member is going to
 first, then the rest, soonest first, each with the facts people compare on.
 */
struct EventsView: View {
    @Environment(AppModel.self) private var app
    @State private var events: [EventListItem] = []
    @State private var loaded = false
    @State private var error: String?

    private var mine: [EventListItem] { events.filter(\.going) }
    private var others: [EventListItem] { events.filter { !$0.going } }

    var body: some View {
        List {
            if let error, events.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load hackathons", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry") { Task { await load() } }
                }
                .listRowBackground(Color.clear)
            } else if loaded, events.isEmpty {
                ContentUnavailableView("No upcoming hackathons yet.", systemImage: "calendar.badge.exclamationmark")
                    .listRowBackground(Color.clear)
            }
            if !mine.isEmpty {
                Section("You're going") {
                    ForEach(mine) { event in row(event) }
                }
            }
            if !others.isEmpty {
                Section(mine.isEmpty ? "All hackathons" : "More hackathons") {
                    ForEach(others) { event in row(event) }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listRowSpacing(10)
        .scrollContentBackground(.hidden)
        .background(Theme.surface)
        .navigationTitle("Hackathons")
        .navigationDestination(for: EventRoute.self) { route in
            EventDetailView(slug: route.slug)
        }
        .overlay { if !loaded { ProgressView() } }
        .task { if !loaded { await load() } }
        .refreshable { await load() }
    }

    private func row(_ event: EventListItem) -> some View {
        NavigationLink(value: EventRoute(slug: event.slug)) {
            EventRow(event: event)
        }
        .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
        .listRowBackground(
            RoundedRectangle(cornerRadius: 18)
                .fill(Theme.bg)
                .overlay(
                    RoundedRectangle(cornerRadius: 18).stroke(
                        event.going ? Theme.successLine : .clear, lineWidth: 2)))
    }

    private func load() async {
        do {
            events = try await app.api.events()
            error = nil
        } catch {
            self.error = (error as? APIError)?.message ?? APIError.unexpected.message
        }
        loaded = true
    }
}

nonisolated struct EventRoute: Hashable, Sendable {
    let slug: String
}

/// One hackathon on the list: date tile, name, dates and place, facts, and how many are going.
private struct EventRow: View {
    let event: EventListItem

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            DateTile(isoDate: event.startDate, shared: event.going)
                .background(
                    event.going ? Theme.successSoft : Theme.accentSoft, in: RoundedRectangle(cornerRadius: 12)
                )
            VStack(alignment: .leading, spacing: 4) {
                Text(event.name).font(.headline)
                Text(
                    [DateText.range(event.startDate, event.endDate), event.formatLabel, event.venue]
                        .compactMap { $0 }.joined(separator: " · ")
                )
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                let facts = facts
                if event.prizeTotalCents != nil || !facts.isEmpty {
                    FlowLayout(spacing: 6) {
                        if let prize = event.prizeTotalCents {
                            FactChip(text: "\(Format.shortDollars(prize)) prizes", highlight: true)
                        }
                        ForEach(facts, id: \.self) { FactChip(text: $0) }
                    }
                    .padding(.top, 4)
                }
                if event.goingCount > 0 || event.applyBy != nil {
                    HStack {
                        if event.goingCount > 0 {
                            Text(going).font(.footnote).foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 8)
                        if let applyBy = event.applyBy {
                            Text("Apply by \(DateText.short(applyBy))")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Color(light: 0x92400e, dark: 0xfcd34d))
                        }
                    }
                    .padding(.top, 2)
                }
                if event.going {
                    Label("You're going", systemImage: "checkmark")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.successInk)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var facts: [String] {
        [
            event.lengthHours.map { "\($0) hours" }, event.levelLabel, Format.cost(event.entryFeeCents),
        ].compactMap { $0 }
    }

    private var going: String {
        let need = event.needTeamCount.map { " · \($0) need a team" } ?? ""
        return "\(event.goingCount) going\(need)"
    }
}

struct FactChip: View {
    let text: String
    var highlight = false

    var body: some View {
        Text(text)
            .font(.caption.weight(highlight ? .semibold : .medium))
            .padding(.horizontal, 10)
            .frame(minHeight: 26)
            .foregroundStyle(highlight ? Color(light: 0x78350f, dark: 0xfde68a) : Theme.ink)
            .background(
                highlight ? Color(light: 0xfef3c7, dark: 0x451a03) : Theme.surface, in: Capsule())
    }
}
