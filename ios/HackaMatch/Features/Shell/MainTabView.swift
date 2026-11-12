import SwiftUI

/// The members' four tabs, as on the web. Events, Matches and Me fill in with phase 4.
struct MainTabView: View {
    enum Section: Hashable { case discover, events, matches, me }

    @Environment(AppModel.self) private var app
    @State private var section: Section = .discover

    var body: some View {
        TabView(selection: $section) {
            Tab("Discover", systemImage: "safari", value: Section.discover) {
                NavigationStack { DiscoverView() }
            }
            Tab("Events", systemImage: "calendar", value: Section.events) {
                NavigationStack {
                    OnTheWeb(title: "Events", systemImage: "calendar", path: "events")
                }
            }
            Tab("Matches", systemImage: "bubble.left.and.bubble.right", value: Section.matches) {
                NavigationStack {
                    OnTheWeb(
                        title: "Matches", systemImage: "bubble.left.and.bubble.right",
                        path: "matches")
                }
            }
            .badge(app.me?.waitingCount ?? 0)
            Tab("Me", systemImage: "person.crop.circle", value: Section.me) {
                NavigationStack { MeView() }
            }
        }
    }
}

/// A tab the app doesn't have yet: the same page on the web.
private struct OnTheWeb: View {
    let title: String
    let systemImage: String
    let path: String

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: systemImage)
        } description: {
            Text("Coming to the app soon. It's on the website for now.")
        } actions: {
            Link("Open on hackamatch.com", destination: AppConfig.webURL(path))
        }
        .navigationTitle(title)
    }
}

/// The member's name and email, and Sign out. The full profile arrives with phase 4.
private struct MeView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        List {
            if let me = app.me {
                Section {
                    HStack(spacing: 14) {
                        AvatarView(name: me.displayName, size: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text([me.firstName, me.lastName].filter { !$0.isEmpty }.joined(separator: " "))
                                .font(.headline)
                            Text(me.email).font(.subheadline).foregroundStyle(Theme.muted)
                        }
                    }
                    .padding(.vertical, 4)
                }
                if let pause = me.pause {
                    Section { Text(pause.label) }
                }
            }
            Section {
                Link("Edit your profile on hackamatch.com", destination: AppConfig.webURL("me"))
            }
            Section {
                Button("Sign out", role: .destructive) { Task { await app.signOut() } }
            }
            Section {
                Link("Terms", destination: AppConfig.webURL("terms"))
                Link("Privacy", destination: AppConfig.webURL("privacy"))
            }
        }
        .navigationTitle("Me")
        .refreshable { await app.refreshMe() }
    }
}
