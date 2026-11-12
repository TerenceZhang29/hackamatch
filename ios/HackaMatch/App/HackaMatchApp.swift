import SwiftUI

@main
struct HackaMatchApp: App {
    @State private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .tint(Theme.accent)
        }
    }
}

/// The part of the app the person should see right now.
struct RootView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        Group {
            switch app.phase {
            case .starting:
                StartingView()
            case .signedOut:
                NavigationStack { LandingView() }
            case .joining:
                NavigationStack { SignupFlowView(asksEmail: false, resume: app.pendingAnswers) }
            case .member:
                MainTabView()
            }
        }
        .task { await app.start() }
    }
}

/// While the saved session is checked; Retry when the server can't be reached.
private struct StartingView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        VStack(spacing: 16) {
            if let error = app.startError {
                Text(error)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.muted)
                Button("Retry") { Task { await app.start() } }
                    .buttonStyle(.primary)
                    .frame(maxWidth: 200)
            } else {
                ProgressView()
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
    }
}
