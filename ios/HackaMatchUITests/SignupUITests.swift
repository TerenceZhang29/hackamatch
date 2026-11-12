import XCTest

/**
 The app end to end against the local stack (`scripts/test-ui.sh`): a new
 student signs up with the emailed code, then uses the deck. The code is read
 from the local mail catcher, as the web's browser tests do.
 */
final class SignupUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testNewStudentSignsUpWithTheEmailedCodeAndUsesTheDeck() async throws {
        let app = XCUIApplication()
        app.launchArguments = ["-reset-session"]
        app.launch()

        app.buttons["Match Now"].tap()
        tap(app.buttons["Undecided yet"])
        app.buttons["Continue"].tap()
        snapshot(app, "2-areas")
        tap(app.buttons["Climate"])
        app.buttons["Continue"].tap()
        snapshot(app, "3-skills")
        tap(app.buttons["Machine learning"])
        app.buttons["Continue"].tap()

        // A `ios-<digits>` address can never be a real student's (real NetIDs are letters, then digits).
        let email = "ios-\(Int.random(in: 100_000_000...999_999_999))@cornell.edu"
        let firstName = app.textFields["First name"]
        firstName.tap()
        firstName.typeText("Ios")
        let emailField = app.textFields["Email"]
        emailField.tap()
        emailField.typeText(email)
        app.buttons["Join HackaMatch"].tap()

        let codeField = app.textFields["Sign-in code"]
        XCTAssertTrue(codeField.waitForExistence(timeout: 15), "the code screen should open")
        let code = try await Mailpit.code(for: email)
        codeField.tap()
        codeField.typeText(code)

        // In the pool: the deck shows the first card.
        let card = app.descendants(matching: .any)["deck.card"]
        XCTAssertTrue(card.waitForExistence(timeout: 20), "Discover should show a card")
        let first = card.label
        snapshot(app, "4-discover")
        XCTAssertFalse(first.isEmpty)

        // Pass, then Undo brings the same person back.
        app.buttons["Pass"].tap()
        let undo = app.buttons["Undo"]
        XCTAssertTrue(undo.waitForExistence(timeout: 10), "Undo should appear after a Pass")
        undo.tap()
        let back = expectation(
            for: NSPredicate(format: "label == %@", first), evaluatedWith: card)
        await fulfillment(of: [back], timeout: 10)
        XCTAssertFalse(app.buttons["Undo"].exists)

        // The full profile opens from the card, with Report or block.
        card.tap()
        XCTAssertTrue(app.buttons["Report or block"].waitForExistence(timeout: 5))
        snapshot(app, "5-profile")
        app.buttons["Done"].tap()

        // Signing out returns to the landing page.
        app.tabBars.buttons["Me"].tap()
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.buttons["Match Now"].waitForExistence(timeout: 10))
    }

    /// A screenshot kept in the test results, for reviewing the screens by eye.
    @MainActor
    private func snapshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Taps, scrolling the element into view first when it's below the fold.
    @MainActor
    private func tap(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 15), "\(element) should exist")
        var swipes = 0
        while !element.isHittable, swipes < 5 {
            XCUIApplication().swipeUp()
            swipes += 1
        }
        element.tap()
    }
}

/// The local mail catcher that `pnpm db:start` runs (http://127.0.0.1:54324).
enum Mailpit {
    private struct Search: Decodable {
        struct Message: Decodable { let ID: String }
        let messages: [Message]
    }

    private struct Message: Decodable { let HTML: String }

    static func code(for email: String) async throws -> String {
        let base = URL(string: "http://127.0.0.1:54324/api/v1/")!
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline {
            var search = URLComponents(url: base.appending(path: "search"), resolvingAgainstBaseURL: false)!
            search.queryItems = [URLQueryItem(name: "query", value: "to:\(email)")]
            let (data, _) = try await URLSession.shared.data(from: search.url!)
            if let id = try JSONDecoder().decode(Search.self, from: data).messages.first?.ID {
                let (body, _) = try await URLSession.shared.data(from: base.appending(path: "message/\(id)"))
                let html = try JSONDecoder().decode(Message.self, from: body).HTML
                if let range = html.range(of: #"<strong>\d{6}</strong>"#, options: .regularExpression) {
                    return String(html[range].filter(\.isNumber))
                }
            }
            try await Task.sleep(for: .milliseconds(500))
        }
        throw URLError(.timedOut)
    }
}
