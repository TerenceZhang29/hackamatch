import SwiftUI

/**
 What a signed-out visitor sees (P1-24): "Find your Hackathon Partner for",
 the next few hackathons rolling one at a time, then Match Now. Signing in
 is one tap below.
 */
struct LandingView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var events: [EventListItem] = []
    @State private var index = 0

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            VStack(spacing: 14) {
                VStack(spacing: 0) {
                    Text("Find your")
                    Text("Hackathon Partner").foregroundStyle(Theme.accent)
                    Text("for")
                }
                .font(.system(size: 40, weight: .heavy))
                .tracking(-1)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)

                ticker
            }
            Spacer()
            VStack(spacing: 12) {
                NavigationLink {
                    SignupFlowView(asksEmail: true, resume: nil)
                } label: {
                    Label("Match Now", systemImage: "arrow.right")
                        .labelStyle(TrailingIconLabelStyle())
                }
                .buttonStyle(.primary)

                NavigationLink("I already have an account") { SignInView() }
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)

                HStack(spacing: 6) {
                    Link("Terms", destination: AppConfig.webURL("terms"))
                    Text("·")
                    Link("Privacy", destination: AppConfig.webURL("privacy"))
                }
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            }
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
        .toolbar(.hidden, for: .navigationBar)
        .task { events = Array(((try? await app.api.events()) ?? []).prefix(5)) }
        .task(id: events.count) {
            // Three seconds each, like the web (owner, 2026-10-22).
            guard events.count > 1 else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                if Task.isCancelled { break }
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) {
                    index = (index + 1) % events.count
                }
            }
        }
    }

    @ViewBuilder private var ticker: some View {
        if events.isEmpty {
            Color.clear.frame(height: 96)
        } else {
            let event = events[index % events.count]
            VStack(spacing: 10) {
                Text(event.name)
                    .font(.title2.weight(.bold))
                    .multilineTextAlignment(.center)
                    .id(event.id)
                    .transition(
                        reduceMotion
                            ? .opacity
                            : .asymmetric(
                                insertion: .move(edge: .trailing).combined(with: .opacity),
                                removal: .move(edge: .leading).combined(with: .opacity)))
                Text(DateText.range(event.startDate, event.endDate))
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 5)
                    .background(Theme.accent, in: Capsule())
                    .foregroundStyle(Theme.accentInk)
                HStack(spacing: 6) {
                    ForEach(events.indices, id: \.self) { dot in
                        Circle()
                            .fill(dot == index % events.count ? Theme.accent : Theme.line)
                            .frame(width: 6, height: 6)
                    }
                }
                .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, minHeight: 96)
            .padding(.vertical, 18)
            .padding(.horizontal, 16)
            .background(Theme.accentSoft, in: RoundedRectangle(cornerRadius: 20))
            .clipped()
            .accessibilityElement(children: .combine)
        }
    }
}

/// The title, then the icon: "Match Now →".
struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.title
            configuration.icon
        }
    }
}
