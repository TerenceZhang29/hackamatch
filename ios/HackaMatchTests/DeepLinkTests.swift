import Foundation
import Testing

@testable import HackaMatch

/// Which links and notifications open what (the site's apple-app-site-association lists the same paths).
struct DeepLinkTests {
    private func parse(_ link: String) -> DeepLink? { DeepLink.parse(URL(string: link)!) }

    @Test func eventPagesAndMatches() {
        #expect(parse("https://hackamatch.com/e/fall-hack") == .event(slug: "fall-hack"))
        #expect(parse("https://www.hackamatch.com/e/fall-hack?join=1") == .event(slug: "fall-hack"))
        #expect(parse("https://hackamatch.com/matches") == .matches)
        let id = "00000000-0000-4000-8000-000000000201"
        #expect(parse("https://hackamatch.com/matches/\(id)") == .match(id: id))
    }

    @Test func theEmailedSignInLink() {
        let link = "https://hackamatch.com/auth/confirm?next=&via=app&token_hash=pkce_abc123&type=email"
        #expect(parse(link) == .signIn(tokenHash: "pkce_abc123"))
        #expect(parse("https://hackamatch.com/auth/confirm?next=") == nil)
    }

    @Test func anythingElseStaysOnTheWeb() {
        #expect(parse("https://hackamatch.com/r/some-token") == nil)
        #expect(parse("https://hackamatch.com/e/Not_A_Slug") == nil)
        #expect(parse("https://hackamatch.com/matches/not-an-id") == nil)
        #expect(parse("https://evil.example/e/fall-hack") == nil)
        #expect(parse("http://hackamatch.com/e/fall-hack") == nil)
        #expect(parse("hackamatch://e/fall-hack") == nil)
    }

    @Test func notifications() {
        let id = "00000000-0000-4000-8000-000000000201"
        #expect(DeepLink.notification(kind: "mutual", matchId: id) == .match(id: id))
        #expect(DeepLink.notification(kind: "inbound_interest", matchId: id) == .matches)
        #expect(DeepLink.notification(kind: nil, matchId: nil) == .matches)
        #expect(NotificationAction.response(for: "INTERESTED") == .interested)
        #expect(NotificationAction.response(for: "PASS") == .pass)
        #expect(NotificationAction.response(for: "com.apple.UNNotificationDefaultActionIdentifier") == nil)
        #expect(NotificationAction.hex(Data([0x00, 0xab, 0x10])) == "00ab10")
    }
}
