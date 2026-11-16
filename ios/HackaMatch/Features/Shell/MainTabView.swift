import SwiftUI

/// The members' four tabs, as on the web.
struct MainTabView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        @Bindable var app = app
        TabView(selection: $app.tab) {
            Tab("Discover", systemImage: "safari", value: AppModel.Tab.discover) {
                NavigationStack { DiscoverView() }
            }
            Tab("Events", systemImage: "calendar", value: AppModel.Tab.events) {
                EventsView()
            }
            Tab("Matches", systemImage: "bubble.left.and.bubble.right", value: AppModel.Tab.matches) {
                MatchesView()
            }
            .badge(app.me?.waitingCount ?? 0)
            Tab("Me", systemImage: "person.crop.circle", value: AppModel.Tab.me) {
                NavigationStack { MeView() }
            }
        }
    }
}
