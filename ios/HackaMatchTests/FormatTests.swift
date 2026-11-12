import Foundation
import Testing

@testable import HackaMatch

/// Money, dates and team sizes the way the web writes them (src/lib/event-details.ts, EventDetails.tsx).
struct FormatTests {
    @Test func money() {
        #expect(Format.dollars(500_000) == "$5,000")
        #expect(Format.dollars(2_550) == "$25.5")
        #expect(Format.shortDollars(1_200_000) == "$12k")
        #expect(Format.shortDollars(150_000) == "$1.5k")
        #expect(Format.shortDollars(50_000) == "$500")
        #expect(Format.cost(0) == "Free")
        #expect(Format.cost(2_500) == "$25 entry")
        #expect(Format.cost(nil) == nil)
    }

    @Test func applyByCountsWholeDays() {
        #expect(Format.daysUntil("2026-11-28", from: "2026-11-25") == 3)
        #expect(Format.daysUntil("2026-03-01", from: "2026-02-28") == 1)
        #expect(Format.applyBy("2026-11-28", today: "2026-11-25") == "Apply by Nov 28 · 3 days left")
        #expect(Format.applyBy("2026-11-28", today: "2026-11-27") == "Apply by Nov 28 · 1 day left")
        #expect(Format.applyBy("2026-11-28", today: "2026-11-28") == "Apply by Nov 28 · last day")
        #expect(Format.applyBy("2026-11-28", today: "2026-11-30") == "Applications closed Nov 28")
        #expect(Format.today(Date(timeIntervalSince1970: 0)).count == 10)
    }

    @Test func teamsAndLinks() {
        #expect(Format.teamSize(min: 2, max: 4) == "2–4 people")
        #expect(Format.teamSize(min: 3, max: 3) == "3 people")
        #expect(Format.teamSize(min: nil, max: nil) == nil)
        #expect(Format.host("https://www.example.com/hack") == "example.com")
        #expect(Format.host("https://devpost.com") == "devpost.com")
    }

    @Test func aSideProjectIsSentAsNull() throws {
        let json = String(decoding: try JSONEncoder().encode(TeamUpBody(eventId: nil)), as: UTF8.self)
        #expect(json == #"{"eventId":null}"#)
        let event = String(decoding: try JSONEncoder().encode(TeamUpBody(eventId: "e1")), as: UTF8.self)
        #expect(event == #"{"eventId":"e1"}"#)
    }
}
