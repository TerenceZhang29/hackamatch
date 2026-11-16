import Foundation

/**
 What a hackamatch.com link or a notification should open. Links arrive as
 universal links (the site's `/.well-known/apple-app-site-association` lists
 which); notifications carry `kind` and `matchId` (src/lib/notify/push.ts).
 */
nonisolated enum DeepLink: Equatable, Sendable {
    case event(slug: String)
    case match(id: String)
    case matches
    /// The emailed sign-in link, when the app asked for it.
    case signIn(tokenHash: String)

    static let hosts: Set<String> = ["hackamatch.com", "www.hackamatch.com"]

    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme == "https", let host = url.host(), hosts.contains(host.lowercased()) else {
            return nil
        }
        let parts = url.path().split(separator: "/").map(String.init)
        switch (parts.first, parts.count) {
        case ("e", 2) where isSlug(parts[1]):
            return .event(slug: parts[1])
        case ("matches", 1):
            return .matches
        case ("matches", 2) where isId(parts[1]):
            return .match(id: parts[1])
        case ("auth", 2) where parts[1] == "confirm":
            let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
            guard let hash = query.first(where: { $0.name == "token_hash" })?.value, !hash.isEmpty
            else { return nil }
            return .signIn(tokenHash: hash)
        default:
            return nil
        }
    }

    /// A notification's `kind` and `matchId`: a match opens its page, interest the Matches tab.
    static func notification(kind: String?, matchId: String?) -> DeepLink {
        if kind == "mutual", let matchId, isId(matchId) { return .match(id: matchId) }
        return .matches
    }

    private static func isSlug(_ value: String) -> Bool {
        value.count <= 80 && value.allSatisfy { $0.isLowercase || $0.isNumber || $0 == "-" } && !value.isEmpty
    }

    private static func isId(_ value: String) -> Bool {
        UUID(uuidString: value) != nil
    }
}

/// The Interested and Pass buttons on an interest notification (category MATCH_INTEREST on the server).
nonisolated enum NotificationAction {
    static let category = "MATCH_INTEREST"
    static let interested = "INTERESTED"
    static let pass = "PASS"

    static func response(for identifier: String) -> DeckResponse? {
        switch identifier {
        case interested: .interested
        case pass: .pass
        default: nil
        }
    }

    /// Data from APNs as the lowercase hex the server stores.
    static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }
}
