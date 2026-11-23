# iOS Game application verification

**Date:** 2026-10-27

**Status:** Research completed on 2026-10-27; its minimal recommendation was subsequently implemented and verified under Plan 241. This note records the research, which installed or launched no app, created no tests or fixtures, and changed no project or production source. Execution evidence belongs to the plan.

## Direct answer

For Plan 241's remaining application journeys, use **one small XCTest UI Testing Bundle**, run by Xcode or `xcodebuild test` on an isolated Simulator. Installing and launching the actual application is normal for this approach. Manual Simulator interaction and LLDB remain useful smoke checks; they do not provide a maintained, repeatable acceptance suite. Apple recommends Swift Testing for new unit/direct integration tests and XCTest for UI workflows that interact with the application's controls. [Adding tests to your Xcode project](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project).

Do **not** add a second unit-test target by default. The existing [TypeScript app tests](../../examples/tic-tac-toe/tests/computer-move.spec.ts) cover the rule samples, and the small [Swift Game implementation](../../examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L4-L30) permits an exact source comparison. The remaining gap is actual SwiftUI/GameController behavior. A separate Swift Testing Unit Testing Bundle is reasonable only if independent Swift rule/decoding regression coverage justifies its additional setup. Conventional app-module unit tests and UI automation are different test products; mixing assertion frameworks does not eliminate the UI boundary. [Apple's unit, integration and UI distinctions](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project).

## Application at research time

- The [Xcode project before implementation](https://github.com/morgs32/zerospin/blob/6940fc4bd91787d8bf4b750b0eb3593a95401fb3/examples/tic-tac-toe/ios/TicTacToe.xcodeproj/project.pbxproj#L3-L6) declared only the application target. Its [shared scheme](https://github.com/morgs32/zerospin/blob/6940fc4bd91787d8bf4b750b0eb3593a95401fb3/examples/tic-tac-toe/ios/TicTacToe.xcodeproj/xcshareddata/xcschemes/TicTacToe.xcscheme) had no Test action and marked the app `buildForTesting="NO"`; there was no iOS test target to extend. Plan 241 subsequently added the standard UI-test target/action.
- [GameController](../../examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L44-L100) constructs the real final `Session`, application-support directory, bundled JavaScript and standard UserDefaults itself. API configuration comes from Bundle Info.plist. Arbitrary launch environment variables currently change none of those choices.
- The [SwiftUI controls](../../examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L147-L193) already expose `gameStatus`, `square0`–`square8`, `startGame` and `computerMoveFailure` accessibility identifiers. Use them. Apple recommends stable identifiers for automation, including SwiftUI interfaces. [Apple's UI automation guidance](https://developer.apple.com/videos/play/wwdc2025/344/).
- [Native application session ownership](../../examples/tic-tac-toe/src/nativeGameSession.ts#L36-L103) retains prior owner sessions while selecting the current one. [GameController.restore](../../examples/tic-tac-toe/ios/TicTacToe/TicTacToeApp.swift#L96-L111) reopens every saved token. This application behavior was not exercised by [Plan 234's public macOS Session probe](../archive/plans/234-plan-node-owned-optimistic-views-and-session-replicas.md#final-host-native-and-consumer-closure--2026-10-27).

## Smallest reasonable repeatable lane

This is the recommendation for this repository, not an Apple requirement to use exactly this test count.

1. Add one UI Testing Bundle and one `TicTacToeUITests.swift` file to the existing project; include it in the shared scheme's Test action. Keep two short workflows: ordinary play/New game/restoration, and retained external Failure. Use ordinary XCTest methods; add no new test framework, custom application driver or Session protocol/mock. Apple supplies the standard UI-test target and XCTestCase structure. [Adding tests](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project).
2. Exercise the real GameController and Session through the controls: initial X turn, pending O, applied O and a terminal result; then New game and terminate/relaunch with the same test storage to check the latest selected Game. The Failure workflow should assert the retained failure heading/message and its restoration. `XCUIApplication` provides launch, terminate and application-state waiting. A terminate/relaunch test establishes that journey, not every OS crash, suspension or power-loss condition. [XCUIApplication](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication).
3. Use a deterministic local backend dependency for O success and the real handled Failure path. For this app, withholding the chooser response can exercise the framework timeout; a provider defect is a different failure path. Mocking the Swift transport/URLSession would exercise connection handling, not the backend chooser's retained `computerMoveFailure`. Keep command admission/execution real. Do not seed Game rows from the app or set UI state to simulate a backend outcome. Reuse existing contract and canonical-backend evidence rather than rebuilding the framework recovery matrix. [Current external request/continuation](../../examples/tic-tac-toe/src/contracts/playExternalOMoveV1.ts), [current handled Failure story](../../examples/tic-tac-toe/tests/computer-move.spec.ts).
4. Isolate the app's UserDefaults, SQLite and backend storage from ordinary development data. Prefer a dedicated disposable Simulator/app container and explicit backend configuration. If repeated runs need a configurable namespace, add only the necessary startup values for backend URL and storage/defaults; preserve the same values across the deliberate relaunch. `launchEnvironment` passes values to the app, but the app must consume them; it is not a way to modify Bundle configuration or private controller state automatically. No dependency hierarchy or Session abstraction is needed. [launchEnvironment](https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/launchenvironment).
5. Query the existing accessibility identifiers and wait for observable conditions with a bounded timeout; do not rely on fixed sleeps. In particular, element existence and an expected label are separate conditions. Apple provides existence and property-value waits. [XCUIElement waiting](https://developer.apple.com/documentation/xcuiautomation/xcuielement/waitforexistence%28timeout%3A%29).
6. Run the configured tests through Xcode or its normal command-line test action, retain the result bundle, and report the exact Simulator and backend conditions. Xcode's test report records failures and execution evidence; compilation alone does not. [Running tests and interpreting results](https://developer.apple.com/documentation/xcode/running-tests-and-interpreting-results).

After the test target and scheme exist, the standard command shape is:

```sh
xcodebuild test \
  -project examples/tic-tac-toe/ios/TicTacToe.xcodeproj \
  -scheme TicTacToe \
  -destination 'platform=iOS Simulator,id=<authorized-simulator>'
```

## Evidence limits and permission boundary

UI assertions establish what the application presents and which controls work. Exact `{ id, board, square }` command payloads, canonical admission/execution and old-owner progress need the corresponding retained backend command/checkpoint evidence; an empty new board alone proves none of those identities. If necessary, extend the existing isolated backend fixture to observe those facts, rather than adding app-only state setters. Source inspection and Plan 234's Session guarantees can support the argument, but must remain identified as such.

The optional Swift unit lane would use a Unit Testing Bundle, a small parameterized Game test file and `@testable import TicTacToe` with testability enabled. It would directly prove Swift rule/decoding behavior, not SwiftUI rendering, session storage or relaunch. It is additional work, not a prerequisite for the minimal UI lane. [Apple's unit-test access and framework guidance](https://developer.apple.com/documentation/xcode/adding-tests-to-your-xcode-project).

At research time, implementing the recommendation required explicit authorization. The maintainer subsequently approved one UI-test file/target and project/scheme configuration, the scoped temporary chooser-failure backend and existing Aggregate replay fixture extension, and installation/execution on the unused iPhone 17 Pro Max simulator `FD15FD71-DCE2-43C3-A916-45DA56C89437`. [Plan 241](../archive/plans/241-plan-tic-tac-toe-board-derived-state.md) records execution evidence separately. A Swift unit-test target would require separate scope if chosen. No existing storage reset, temporary Swift probe or Session mock is authorized.
