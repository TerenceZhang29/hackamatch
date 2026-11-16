import Foundation
import Observation
import UIKit
import UserNotifications

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
    /// A link to an event: the Events tab opens its page.
    var openEventSlug: String?
    /// Sign-up's answers while its code is on the way, so the emailed link can finish sign-up too.
    var awaitingAnswers: SignupAnswers?

    /// This phone's push token, kept so signing out can forget it on the server.
    private var pushToken: String? {
        get { UserDefaults.standard.string(forKey: "pushToken") }
        set { UserDefaults.standard.set(newValue, forKey: "pushToken") }
    }
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
        pushToken = nil
        sessionEnded()
    }

    // MARK: Push

    /// Asks once, after the member's first Interested, not at launch (docs/plans/ios-app.md).
    func askForPushIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        guard await center.notificationSettings().authorizationStatus == .notDetermined else { return }
        let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) == true
        pushLog.info("Notifications allowed: \(granted)")
        if granted { await registerForRemoteNotifications() }
    }

    private func registerForRemoteNotifications() async {
        #if DEBUG
            // UI tests: a simulator signed without a provisioning profile gets no APNs token, so
            // stand one in to test the rest of the way (this phone → the server).
            if ProcessInfo.processInfo.arguments.contains("-fake-push-token") {
                await deviceRegistered(String(repeating: "ab", count: 32))
                return
            }
        #endif
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Fetches the token again on each start when allowed: Apple can change it.
    private func registerForPushIfAllowed() async {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if status == .authorized || status == .provisional {
            await registerForRemoteNotifications()
        }
    }

    func deviceRegistered(_ token: String) async {
        pushToken = token
        guard api.session != nil else { return }
        do {
            try await api.registerDevice(token: token)
            pushLog.info("Phone registered for push")
        } catch {
            pushLog.error("Couldn't register this phone: \((error as? APIError)?.message ?? "", privacy: .public)")
        }
    }

    /// A notification was tapped, or Interested / Pass pressed on it.
    func notificationAnswered(action: String, kind: String?, matchId: String?) async {
        guard phase == .member || api.session != nil else { return }
        if let response = NotificationAction.response(for: action), let matchId {
            do {
                _ = try await api.answerMatch(matchId, response)
            } catch {
                flash((error as? APIError)?.message ?? APIError.unexpected.message)
            }
            await refreshMe()
            return
        }
        route(DeepLink.notification(kind: kind, matchId: matchId))
    }

    // MARK: Links

    /// A hackamatch.com link that opened the app.
    func open(_ url: URL) async {
        guard let link = DeepLink.parse(url) else { return }
        if case .signIn(let tokenHash) = link {
            guard phase == .signedOut || phase == .starting else {
                flash("You're already signed in.", isError: false)
                return
            }
            do {
                _ = try await api.verify(tokenHash: tokenHash)
                try await signedIn(answers: awaitingAnswers)
                awaitingAnswers = nil
            } catch {
                flash((error as? APIError)?.message ?? APIError.unexpected.message)
            }
            return
        }
        route(link)
    }

    /// A link or a tapped notification from before the tabs were showing (the app was still starting).
    private var pendingLink: DeepLink?

    private func route(_ link: DeepLink) {
        guard phase == .member else {
            pendingLink = link
            return
        }
        switch link {
        case .event(let slug):
            openEventSlug = slug
            tab = .events
        case .match(let id):
            openMatch(id)
        case .matches:
            tab = .matches
        case .signIn:
            break
        }
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
        // Forget this phone first, while the session can still say whose it is.
        if let token = pushToken {
            try? await api.unregisterDevice(token: token)
            pushToken = nil
        }
        await api.signOut()
        sessionEnded()
    }

    private func apply(_ me: Me) {
        let joined = phase != .member && me.onboarded
        self.me = me
        phase = me.onboarded ? .member : .joining
        let waiting = me.waitingCount
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(waiting) }
        if joined {
            Task { await registerForPushIfAllowed() }
            if let link = pendingLink {
                pendingLink = nil
                route(link)
            }
        }
    }

    private func sessionEnded() {
        me = nil
        tab = .discover
        awaitingAnswers = nil
        pendingLink = nil
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(0) }
        pendingAnswers = nil
        phase = .signedOut
    }
}
