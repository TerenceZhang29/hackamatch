import Foundation
import Observation

/**
 Who is using the app, and which part of it they see: the landing page when
 signed out, sign-up's steps when signed in but not joined, the tabs once a member.
 */
@Observable
final class AppModel {
    enum Phase: Equatable {
        case starting, signedOut, joining, member
    }

    private(set) var phase: Phase = .starting
    private(set) var me: Me?
    /// Why the app couldn't start (offline); the starting screen offers Retry.
    private(set) var startError: String?
    /// Answers that didn't reach the server after the code was verified; sign-up resumes with them.
    private(set) var pendingAnswers: SignupAnswers?
    let api: APIClient

    /// The members' tabs, and requests that cross them.
    enum Tab: Hashable { case discover, events, matches, me }
    var tab: Tab = .discover
    /// "Discover who's going": Discover narrows to this event once it shows.
    var discoverEvent: String??
    /// "Open match": the Matches tab opens this pair page.
    var openMatchId: String?
    /// One line at the top of the screen, for a moment.
    private(set) var flashMessage: (text: String, isError: Bool)?

    func discover(eventSlug: String?) {
        discoverEvent = .some(eventSlug)
        tab = .discover
    }

    func openMatch(_ matchId: String) {
        openMatchId = matchId
        tab = .matches
    }

    func flash(_ text: String, isError: Bool = true) {
        flashMessage = (text, isError)
        Task {
            try? await Task.sleep(for: .seconds(4))
            if flashMessage?.text == text { flashMessage = nil }
        }
    }

    /// After an edit that returned the member's new profile.
    func update(_ me: Me) {
        apply(me)
    }

    func deleteAccount() async throws {
        try await api.deleteAccount()
        sessionEnded()
    }

    init(api: APIClient? = nil) {
        #if DEBUG
            // UI tests start signed out.
            if ProcessInfo.processInfo.arguments.contains("-reset-session") {
                SessionStore().clear()
            }
        #endif
        self.api = api ?? APIClient()
        self.api.onSessionEnded = { [weak self] in self?.sessionEnded() }
    }

    func start() async {
        startError = nil
        guard api.session != nil else {
            phase = .signedOut
            return
        }
        do {
            apply(try await api.me())
        } catch let error as APIError where error.status == 401 {
            phase = .signedOut
        } catch {
            startError = (error as? APIError)?.message ?? APIError.unexpected.message
        }
    }

    /// After the code is verified. With sign-up's answers, joins the pool at once.
    func signedIn(answers: SignupAnswers?) async throws {
        guard let answers else {
            apply(try await api.me())
            return
        }
        do {
            apply(try await api.signup(answers))
        } catch {
            // Signed in, but not joined yet: sign-up resumes on its last step.
            pendingAnswers = answers
            phase = .joining
            throw error
        }
    }

    /// Sign-up's steps for someone already signed in.
    func join(_ answers: SignupAnswers) async throws {
        apply(try await api.signup(answers))
        pendingAnswers = nil
    }

    func refreshMe() async {
        if let me = try? await api.me() { apply(me) }
    }

    func signOut() async {
        await api.signOut()
        sessionEnded()
    }

    private func apply(_ me: Me) {
        self.me = me
        phase = me.onboarded ? .member : .joining
    }

    private func sessionEnded() {
        me = nil
        tab = .discover
        pendingAnswers = nil
        phase = .signedOut
    }
}
