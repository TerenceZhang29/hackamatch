import XCTest

/**
 The app end to end against the local stack (`scripts/test-ui.sh`): a new
 student signs up with the emailed code, uses the deck, goes to a
 hackathon, matches with the demo profile the script adds, teams up, and
 deletes their account. The code is read
 from the local mail catcher, as the web's browser tests do.
 */
final class SignupUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testNewStudentSignsUpMatchesTeamsUpAndDeletesTheirAccount() async throws {
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

        // Events: going to Health AI Buildathon, then Discover who's going.
        app.tabBars.buttons["Events"].tap()
        let event = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Health AI Buildathon")).firstMatch
        tap(event)
        tap(app.buttons["I'm going!"])
        XCTAssertTrue(app.staticTexts["You're going!"].waitForExistence(timeout: 10))
        snapshot(app, "6-event")
        app.buttons["Discover who's going"].tap()
        let chip = app.buttons["Health AI Buildathon"]
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        XCTAssertTrue(chip.isSelected, "Discover should be narrowed to the event")

        // The demo profile answers Interested at once: Pass everyone else until it shows.
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        var passes = 0
        while !card.label.hasPrefix("Iris D."), passes < 20 {
            app.buttons["Pass"].tap()
            passes += 1
            XCTAssertTrue(card.waitForExistence(timeout: 10), "the demo profile should be in the deck")
        }
        app.buttons["Interested"].tap()
        XCTAssertTrue(app.staticTexts["It's a match!"].waitForExistence(timeout: 10))
        app.buttons["Open your match"].tap()

        // The pair page: contact details, a hackathon picked, a team made.
        XCTAssertTrue(app.navigationBars["You and Iris"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Iris Demo"].exists)
        snapshot(app, "7-pair")
        tap(app.buttons["We teamed up"])
        XCTAssertTrue(app.staticTexts["Team saved. Good luck!"].waitForExistence(timeout: 10))

        // Matches lists it as mutual, and the hackathon shows the team.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.segmentedControls.buttons["Mutual 1"].waitForExistence(timeout: 10))
        snapshot(app, "8-matches")

        // Me: the name from sign-up, then delete the account, which ends at the landing page.
        app.tabBars.buttons["Me"].tap()
        XCTAssertTrue(app.staticTexts["Shown as Ios"].waitForExistence(timeout: 10))
        snapshot(app, "9-me")
        tap(app.buttons["Delete account"])
        let confirm = app.textFields["Type delete"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        confirm.typeText("delete")
        app.buttons["Delete my account"].tap()
        XCTAssertTrue(app.buttons["Match Now"].waitForExistence(timeout: 15))
    }

    /// A screenshot kept in the test results, for reviewing the screens by eye.
    @MainActor
    private func snapshot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Taps, scrolling down first when the element is below the fold (lazy lists only create what's on screen).
    @MainActor
    private func tap(_ element: XCUIElement) {
        var swipes = 0
        while !(element.waitForExistence(timeout: swipes == 0 ? 10 : 2) && element.isHittable), swipes < 6 {
            XCUIApplication().swipeUp()
            swipes += 1
        }
        XCTAssertTrue(element.exists && element.isHittable, "\(element) should be on screen")
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
