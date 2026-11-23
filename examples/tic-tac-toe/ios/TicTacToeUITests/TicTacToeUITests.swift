import XCTest

@MainActor final class TicTacToeUITests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testPlayNewGameAndRestoreSelection() {
    let app = XCUIApplication()
    startFreshGame(app)
    app.buttons["square0"].tap()
    expectLabel(app.buttons["square1"], "Row 1, column 2, O")
    expectLabel(app.staticTexts["gameStatus"], "Your turn · X")
    app.buttons["square3"].tap()
    expectLabel(app.buttons["square2"], "Row 1, column 3, O")
    app.buttons["square6"].tap()
    expectLabel(app.staticTexts["gameStatus"], "You won")
    XCTAssertFalse(app.buttons["square4"].isEnabled)

    app.buttons["startGame"].tap()
    expectEmptyBoard(app)
    app.buttons["square8"].tap()
    expectLabel(app.buttons["square0"], "Row 1, column 1, O")
    expectLabel(app.buttons["square8"], "Row 3, column 3, X")
    app.terminate()
    app.launch()
    expectLabel(app.buttons["square0"], "Row 1, column 1, O")
    expectLabel(app.buttons["square8"], "Row 3, column 3, X")
    expectLabel(app.staticTexts["gameStatus"], "Your turn · X")
  }

  func testRetainedComputerFailureSurvivesRelaunch() {
    let app = XCUIApplication()
    startFreshGame(app)
    app.buttons["square4"].tap()
    expectLabel(app.staticTexts["gameStatus"], "O is thinking…")
    expectLabel(app.buttons["square4"], "Row 2, column 2, X")
    let message = "External request ended without a usable response"
    expectLabel(app.staticTexts["computerMoveFailure"], message, timeout: 60)
    expectLabel(app.staticTexts["gameStatus"], "Computer move failed")
    XCTAssertFalse(app.buttons["square0"].isEnabled)
    app.terminate()
    app.launch()
    expectLabel(app.staticTexts["computerMoveFailure"], message)
    expectLabel(app.staticTexts["gameStatus"], "Computer move failed")
    expectLabel(app.buttons["square4"], "Row 2, column 2, X")
  }

  private func startFreshGame(_ app: XCUIApplication) {
    app.launch()
    let button = app.buttons["startGame"]
    XCTAssertTrue(button.waitForExistence(timeout: 30))
    waitFor(button, NSPredicate(format: "enabled == true"))
    button.tap()
    expectEmptyBoard(app)
  }

  private func expectEmptyBoard(_ app: XCUIApplication) {
    for square in 0..<9 {
      expectLabel(
        app.buttons["square\(square)"],
        "Row \(square / 3 + 1), column \(square % 3 + 1), empty")
    }
    expectLabel(app.staticTexts["gameStatus"], "Your turn · X")
    waitFor(app.buttons["square0"], NSPredicate(format: "enabled == true"))
  }

  private func expectLabel(
    _ element: XCUIElement, _ label: String, timeout: TimeInterval = 30
  ) {
    waitFor(element, NSPredicate(format: "label == %@", label), timeout: timeout)
  }

  private func waitFor(
    _ element: XCUIElement, _ predicate: NSPredicate, timeout: TimeInterval = 30
  ) {
    let expectation = XCTNSPredicateExpectation(predicate: predicate, object: element)
    XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed)
  }
}
