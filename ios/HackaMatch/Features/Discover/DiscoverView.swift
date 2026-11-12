import SwiftUI

/// Discover: the deck, built once per sign-in.
struct DiscoverView: View {
    @Environment(AppModel.self) private var app
    @State private var model: DeckModel?

    var body: some View {
        Group {
            if let model {
                DeckScreen(model: model)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Theme.surface)
        .navigationTitle("Discover")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            guard model == nil else { return }
            let deck = DeckModel(service: app.api)
            model = deck
            await deck.load()
        }
    }
}

/**
 The hackathon chips, the card on top (swipe right for Interested, left to
 Pass, tap for the full profile), and the round buttons under it. Buttons
 and VoiceOver actions do everything a swipe does.
 */
private struct DeckScreen: View {
    @Bindable var model: DeckModel
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var profile: Person?
    /// Which way the last card left, for its exit animation.
    @State private var exit: DeckResponse = .pass

    var body: some View {
        VStack(spacing: 12) {
            if !model.filterEvents.isEmpty {
                FilterBar(model: model)
            }
            ZStack {
                if let top = model.cards.first {
                    if model.cards.count > 1 {
                        PersonCardView(person: model.cards[1])
                            .scaleEffect(0.95)
                            .offset(y: 12)
                            .opacity(0.6)
                            .accessibilityHidden(true)
                    }
                    SwipeCard(person: top, onAnswer: answer, onOpen: { profile = top })
                        .id(top.id)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .asymmetric(
                                    insertion: .scale(scale: 0.95).combined(with: .opacity),
                                    removal: .offset(x: exit == .pass ? -600 : 600).combined(
                                        with: .opacity)))
                } else if let error = model.loadError {
                    ContentUnavailableView {
                        Label("Couldn't load Discover", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") { Task { await model.load(event: model.eventSlug) } }
                    }
                } else if model.loaded {
                    ContentUnavailableView {
                        Label("You've seen everyone", systemImage: "person.2")
                    } description: {
                        Text(
                            model.eventSlug == nil
                                ? "Check back soon: new people join every day."
                                : "Nobody else is looking for this hackathon yet. Try another.")
                    }
                } else {
                    ProgressView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            // The card on top changing is what animates: it leaves the way it was answered.
            .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: model.cards.first?.id)

            AnswerBar(model: model, onAnswer: answer)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .overlay(alignment: .top) {
            if let notice = model.notice {
                NoticeBanner(text: notice)
                    .padding(.top, 8)
                    .padding(.horizontal, 16)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(4))
                        withAnimation { model.notice = nil }
                    }
            }
        }
        .animation(.default, value: model.notice)
        .sheet(item: $model.match) { match in
            MatchSheet(match: match)
        }
        .sheet(item: $profile) { person in
            ProfileSheet(person: person, model: model, onAnswer: answer)
        }
        .refreshable { await model.load(event: model.eventSlug) }
    }

    private func answer(_ response: DeckResponse) {
        exit = response
        Task {
            await model.answer(response)
            if model.match != nil { await app.refreshMe() }
        }
    }
}

/// The hackathon chips above the deck; the selected one is filled dark with ✓.
private struct FilterBar: View {
    let model: DeckModel

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ChipView(label: "Everyone", selected: model.eventSlug == nil) {
                    Task { await model.load(event: nil) }
                }
                ForEach(model.filterEvents) { event in
                    ChipView(
                        label: event.name, tone: event.going ? .success : .neutral,
                        selected: model.eventSlug == event.slug
                    ) {
                        Task { await model.select(event: event.slug) }
                    }
                }
            }
            .padding(.vertical, 2)
        }
        .accessibilityLabel("Hackathons")
    }
}

/// The card on top, which follows a drag and answers when let go far enough to a side.
private struct SwipeCard: View {
    let person: Person
    let onAnswer: (DeckResponse) -> Void
    let onOpen: () -> Void
    @State private var offset: CGSize = .zero

    private static let threshold: CGFloat = 110

    var body: some View {
        PersonCardView(person: person)
            .overlay(alignment: .top) { stamp }
            .offset(x: offset.width, y: offset.height * 0.15)
            .rotationEffect(.degrees(Double(offset.width / 22)), anchor: .bottom)
            .gesture(
                DragGesture(minimumDistance: 12)
                    .onChanged { offset = $0.translation }
                    .onEnded { value in
                        let distance = value.translation.width
                        if abs(distance) > Self.threshold {
                            onAnswer(distance > 0 ? .interested : .pass)
                        } else {
                            withAnimation(.spring(duration: 0.3)) { offset = .zero }
                        }
                    }
            )
            .onTapGesture(perform: onOpen)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("deck.card")
            .accessibilityHint("Double-tap for the full profile")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { onOpen() }
            .accessibilityAction(named: "Pass") { onAnswer(.pass) }
            .accessibilityAction(named: "Interested") { onAnswer(.interested) }
    }

    @ViewBuilder private var stamp: some View {
        let progress = min(abs(offset.width) / Self.threshold, 1)
        if offset.width > 20 {
            StampLabel(text: "Interested", color: Theme.successInk).opacity(progress)
        } else if offset.width < -20 {
            StampLabel(text: "Pass", color: Theme.muted).opacity(progress)
        }
    }
}

private struct StampLabel: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text.uppercased())
            .font(.headline.weight(.heavy))
            .tracking(1)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .foregroundStyle(color)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(color, lineWidth: 3))
            .padding(.top, 60)
            .accessibilityHidden(true)
    }
}

/// Undo (after a Pass), Pass and Interested: round, icon-only, named for VoiceOver.
private struct AnswerBar: View {
    let model: DeckModel
    let onAnswer: (DeckResponse) -> Void

    var body: some View {
        HStack(spacing: 24) {
            if model.undoable != nil {
                RoundButton(systemImage: "arrow.uturn.backward", label: "Undo", size: 46) {
                    Task { await model.undo() }
                }
            }
            RoundButton(systemImage: "xmark", label: "Pass", size: 62) { onAnswer(.pass) }
            RoundButton(systemImage: "heart.fill", label: "Interested", size: 62, filled: true) {
                onAnswer(.interested)
            }
        }
        .disabled(model.cards.isEmpty)
        .frame(maxWidth: .infinity, minHeight: 70)
        .animation(.default, value: model.undoable)
    }
}

private struct RoundButton: View {
    let systemImage: String
    let label: String
    let size: CGFloat
    var filled = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.38, weight: .bold))
                .frame(width: size, height: size)
                .foregroundStyle(filled ? Theme.accentInk : Theme.ink)
                .background(filled ? Theme.accent : Theme.bg, in: Circle())
                .shadow(color: .black.opacity(0.12), radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// "It's a match!" after an Interested that made it mutual.
private struct MatchSheet: View {
    let match: DeckMatch
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "party.popper.fill")
                .font(.system(size: 48))
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text("It's a match!")
                .font(.title.bold())
                .accessibilityAddTraits(.isHeader)
            Text("You and \(match.name) are both interested. We emailed you both each other's contact details.")
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.muted)
            Button("Keep matching") { dismiss() }
                .buttonStyle(.primary)
                .padding(.top, 8)
        }
        .padding(28)
        .presentationDetents([.medium])
        .sensoryFeedback(.success, trigger: match)
    }
}
