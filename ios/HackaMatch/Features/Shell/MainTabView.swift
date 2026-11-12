import SwiftUI

/// The members' four tabs, as on the web, with one-line notices over all of them.
struct MainTabView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.tab) {
            Tab("Discover", systemImage: "safari", value: AppModel.Tab.discover) {
                NavigationStack { DiscoverView() }
            }
            Tab("Events", systemImage: "calendar", value: AppModel.Tab.events) {
                NavigationStack { EventsView() }
            }
            Tab("Matches", systemImage: "bubble.left.and.bubble.right", value: AppModel.Tab.matches) {
                MatchesView()
            }
            .badge(app.me?.waitingCount ?? 0)
            Tab("Me", systemImage: "person.crop.circle", value: AppModel.Tab.me) {
                NavigationStack { MeView() }
            }
        }
        .overlay(alignment: .top) {
            if let flash = app.flashMessage {
                NoticeBanner(text: flash.text, isError: flash.isError)
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .animation(.default, value: app.flashMessage?.text)
    }
}
