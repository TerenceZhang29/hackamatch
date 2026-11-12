import Foundation

/// A failed call: the server's own code and message, or `offline`.
nonisolated struct APIError: Error, LocalizedError, Equatable, Sendable {
    let status: Int
    let code: String
    let message: String

    var errorDescription: String? { message }

    static let offline = APIError(
        status: 0, code: "offline",
        message: "Can't reach HackaMatch. Check your connection and try again.")
    static let unexpected = APIError(
        status: 0, code: "unexpected", message: "Something went wrong. Try again.")
}

/// Where the API lives: the build's `HMAPIBaseURL`, or `HM_API_BASE_URL` from the environment in Debug.
enum AppConfig {
    static var apiBaseURL: URL {
        #if DEBUG
            if let override = ProcessInfo.processInfo.environment["HM_API_BASE_URL"],
                let url = URL(string: override)
            {
                return url
            }
        #endif
        let raw = Bundle.main.object(forInfoDictionaryKey: "HMAPIBaseURL") as? String
        return URL(string: raw ?? "") ?? URL(string: "https://hackamatch.com")!
    }

    static func webURL(_ path: String) -> URL {
        apiBaseURL.appending(path: path)
    }
}

/**
 The app's one way to the server (`/api/v1`, docs/plans/ios-app.md). Sends
 the session's access token as a bearer token, refreshes it when it is about
 to expire or the server says it has, and keeps the session in the Keychain.
 When the session can't be refreshed, `onSessionEnded` runs.
 */
final class APIClient {
    enum Method: String {
        case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE"
    }

    let baseURL: URL
    private let urlSession: URLSession
    private let store: SessionStore
    private(set) var session: APISession?
    private var refreshing: Task<APISession?, Never>?
    var onSessionEnded: (() -> Void)?

    init(
        baseURL: URL = AppConfig.apiBaseURL, urlSession: URLSession = .shared,
        store: SessionStore = SessionStore()
    ) {
        self.baseURL = baseURL
        self.urlSession = urlSession
        self.store = store
        self.session = store.load()
    }

    func setSession(_ session: APISession) {
        self.session = session
        store.save(session)
    }

    func clearSession() {
        session = nil
        store.clear()
    }

    /// Calls `path` under `/api/v1` and decodes the reply. `authenticated: false` for sign-in itself.
    func request<T: Decodable>(
        _ method: Method, _ path: String, query: [URLQueryItem] = [],
        body: (any Encodable)? = nil, authenticated: Bool = true
    ) async throws -> T {
        if authenticated, let session, Double(session.expiresAt) - 60 < Date().timeIntervalSince1970
        {
            _ = await refresh()
        }
        var (data, status) = try await perform(method, path, query, body, authenticated)
        if status == 401, authenticated, session != nil, await refresh() != nil {
            (data, status) = try await perform(method, path, query, body, authenticated)
        }
        guard (200..<300).contains(status) else {
            let detail = try? JSONDecoder().decode(APIErrorBody.self, from: data).error
            if status == 401, authenticated, session != nil { endSession() }
            throw APIError(
                status: status, code: detail?.code ?? "unexpected",
                message: detail?.message ?? APIError.unexpected.message)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(status: status, code: "decoding", message: APIError.unexpected.message)
        }
    }

    private func perform(
        _ method: Method, _ path: String, _ query: [URLQueryItem], _ body: (any Encodable)?,
        _ authenticated: Bool
    ) async throws -> (Data, Int) {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = "/api/v1" + path
        components.queryItems = query.isEmpty ? nil : query
        var request = URLRequest(url: components.url!)
        request.httpMethod = method.rawValue
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token = session?.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, response) = try await urlSession.data(for: request)
            return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        } catch {
            throw APIError.offline
        }
    }

    /// One refresh at a time; callers waiting on it share the result. Nil when it failed.
    private func refresh() async -> APISession? {
        if let refreshing { return await refreshing.value }
        guard let token = session?.refreshToken else { return nil }
        let task = Task { () -> APISession? in
            do {
                let fresh: APISession = try await request(
                    .post, "/auth/refresh", body: RefreshBody(refreshToken: token),
                    authenticated: false)
                setSession(fresh)
                return fresh
            } catch let error as APIError where error.status == 401 {
                // The refresh token is used, revoked or unknown: sign in again.
                endSession()
                return nil
            } catch {
                // Offline: keep the session and try again on the next call.
                return nil
            }
        }
        refreshing = task
        let result = await task.value
        refreshing = nil
        return result
    }

    private func endSession() {
        guard session != nil else { return }
        clearSession()
        onSessionEnded?()
    }
}

nonisolated private struct RefreshBody: Encodable, Sendable { let refreshToken: String }
nonisolated private struct EmailBody: Encodable, Sendable { let email: String }
nonisolated private struct VerifyBody: Encodable, Sendable { let email, code: String }
nonisolated private struct AnswerBody: Encodable, Sendable {
    let userId: String
    let response: DeckResponse
}
nonisolated private struct UndoBody: Encodable, Sendable { let undoToken: String }
nonisolated private struct ReportBody: Encodable, Sendable {
    let userId: String
    let reason: ReportReason
    let note: String?
}

// MARK: Endpoints

extension APIClient {
    /// Emails a sign-in code. Refusals (wrong domain, pilot list, too many tries) come back as the error's message.
    func requestCode(email: String) async throws {
        let _: OK = try await request(
            .post, "/auth/request", body: EmailBody(email: email), authenticated: false)
    }

    /// Trades the emailed code for a session, and keeps it.
    func verify(email: String, code: String) async throws -> APISession {
        let session: APISession = try await request(
            .post, "/auth/verify", body: VerifyBody(email: email, code: code),
            authenticated: false)
        setSession(session)
        return session
    }

    /// Ends the session on the server too. Never fails: the app forgets it either way.
    func signOut() async {
        if session != nil {
            let _: OK? = try? await request(.post, "/auth/signout")
        }
        clearSession()
    }

    func me() async throws -> Me { try await request(.get, "/me") }

    func signup(_ answers: SignupAnswers) async throws -> Me {
        try await request(.post, "/signup", body: answers)
    }

    func taxonomy() async throws -> Taxonomy { try await request(.get, "/taxonomy") }

    func events() async throws -> [EventListItem] {
        let response: EventsResponse = try await request(.get, "/events")
        return response.events
    }

    func block(userId: String) async throws {
        let _: BlocksResponse = try await request(.put, "/blocks/\(userId)")
    }

    func report(userId: String, reason: ReportReason, note: String?) async throws {
        let _: OK = try await request(
            .post, "/reports", body: ReportBody(userId: userId, reason: reason, note: note))
    }
}

/// What the deck needs from the server, so its logic can be tested without one.
protocol DeckService: AnyObject {
    func deck(event: String?) async throws -> Deck
    func answer(userId: String, response: DeckResponse) async throws -> DeckAnswer
    func undo(token: String) async throws -> Bool
}

extension APIClient: DeckService {
    func deck(event: String?) async throws -> Deck {
        try await request(.get, "/deck", query: event.map { [URLQueryItem(name: "event", value: $0)] } ?? [])
    }

    func answer(userId: String, response: DeckResponse) async throws -> DeckAnswer {
        try await request(.post, "/deck/answer", body: AnswerBody(userId: userId, response: response))
    }

    func undo(token: String) async throws -> Bool {
        let result: DeckUndo = try await request(.post, "/deck/undo", body: UndoBody(undoToken: token))
        return result.undone
    }
}
