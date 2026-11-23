import SwiftUI
import Zerospin

struct Game: Decodable {
  let id: String
  let board: String
  let computerMoveFailure: String?

  var outcome: String? {
    let squares = Array(board)
    guard squares.count == 9, squares.allSatisfy({ "XO.".contains($0) }) else { return nil }
    let winningLines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ]
    for line in winningLines {
      let mark = squares[line[0]]
      if mark != ".", line.allSatisfy({ squares[$0] == mark }) { return String(mark) }
    }
    return squares.contains(".") ? "playing" : "draw"
  }

  var turn: String? {
    guard outcome == "playing" else { return nil }
    let xCount = board.filter { $0 == "X" }.count
    let oCount = board.filter { $0 == "O" }.count
    if xCount == oCount { return "X" }
    if xCount == oCount + 1 { return "O" }
    return nil
  }
}
struct Snapshot: Decodable {
  struct Resources: Decodable { let game: [Game] }
  struct Node: Decodable {
    let synchronization: String?
    let uncertainHandoffs: Int?
  }
  let resources: Resources
  let node: Node
  let failure: String?
}

@Observable @MainActor final class GameController {
  let session: Session
  var busy = false
  var error: String?
  private var tokens: [String]
  private let bundle: URL
  init() {
    let directory = URL.applicationSupportDirectory.appendingPathComponent(
      "Zerospin", isDirectory: true)
    session = Session(storageDirectory: directory)
    bundle = Bundle.main.url(forResource: "tic-tac-toe", withExtension: "js")!
    tokens = UserDefaults.standard.stringArray(forKey: "gameIdentities") ?? []
    if tokens.isEmpty {
      tokens = [Self.token()]
      save()
    }
  }
  private static func token() -> String {
    UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
  }
  private func save() { UserDefaults.standard.set(tokens, forKey: "gameIdentities") }
  var snapshot: Snapshot? {
    try? JSONDecoder().decode(Snapshot.self, from: Data(session.snapshotJSON.utf8))
  }
  var game: Game? { snapshot?.resources.game.first }
  var status: String {
    guard let game else { return session.isInitialized ? "Start a game" : "Connecting…" }
    if game.computerMoveFailure != nil { return "Computer move failed" }
    switch game.outcome {
    case .some("X"): return "You won"
    case .some("O"): return "O won"
    case .some("draw"): return "Draw"
    default:
      switch game.turn {
      case .some("X"): return "Your turn · X"
      case .some("O"): return "O is thinking…"
      default: return "Game unavailable"
      }
    }
  }
  private func initialize(_ token: String) async throws {
    let config: [String: Any] = [
      "apiUrl": Bundle.main.object(forInfoDictionaryKey: "ZerospinAPIURL") as? String
        ?? "http://localhost:12003",
      "publishableKey": Bundle.main.object(forInfoDictionaryKey: "ZerospinPublishableKey")
        as? String ?? "pk_local", "aggregateId": "acct_\(token)",
      "claims": ["aggregateId": "acct_\(token)", "instanceId": "gam_\(token)"],
      "credentials": ["instanceId": "gam_\(token)"],
    ]
    let json = String(data: try JSONSerialization.data(withJSONObject: config), encoding: .utf8)!
    try await session.initialize(bundleURL: bundle, configurationJSON: json)
  }
  func restore() async {
    await perform {
      // Reopen every retained owner so prior-game work resumes after relaunch.
      for token in self.tokens { try await self.initialize(token) }
    }
  }
  func start(new: Bool) async {
    await perform {
      if new {
        self.tokens.append(Self.token())
        self.save()
        try await self.initialize(self.tokens.last!)
      }
      let payload = "{\"id\":\"gam_\(self.tokens.last!)\"}"
      _ = try await self.session.stage(contractName: "createGame", payloadJSON: payload)
    }
  }
  func play(_ square: Int) async {
    guard let game else { return }
    await perform {
      let payload = String(
        data: try JSONSerialization.data(withJSONObject: [
          "id": game.id, "board": game.board, "square": square,
        ]), encoding: .utf8)!
      _ = try await self.session.stage(contractName: "playX", payloadJSON: payload)
    }
  }
  func lifecycle(_ phase: ScenePhase) async {
    guard session.isInitialized else { return }
    do {
      if phase == .active { try await session.resume() } else { try await session.suspend() }
    } catch { self.error = error.localizedDescription }
  }
  private func perform(_ action: () async throws -> Void) async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      try await action()
      error = nil
    } catch { self.error = error.localizedDescription }
  }
}

@main struct TicTacToeApp: App {
  @State private var controller = GameController()
  @Environment(\.scenePhase) private var phase
  var body: some Scene {
    WindowGroup {
      VStack(spacing: 24) {
        Text("Tic Tac Toe").font(.largeTitle.bold())
        Text(controller.status).font(.title3).accessibilityIdentifier("gameStatus")
        LazyVGrid(
          columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12
        ) {
          ForEach(0..<9, id: \.self) { square in
            let mark = controller.game.map { String(Array($0.board)[square]) } ?? "."
            Button {
              Task { await controller.play(square) }
            } label: {
              Text(mark == "." ? " " : mark).font(.system(size: 46, weight: .bold))
                .frame(maxWidth: .infinity).frame(height: 88)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 16))
            }
            .disabled(
              controller.busy || mark != "." || controller.game?.turn != "X"
                || controller.game?.outcome != "playing"
            )
            .accessibilityLabel(
              "Row \(square / 3 + 1), column \(square % 3 + 1), \(mark == "." ? "empty" : mark)"
            )
            .accessibilityIdentifier("square\(square)")
          }
        }
        Button(controller.game == nil ? "Start game" : "New game") {
          Task { await controller.start(new: controller.game != nil) }
        }
        .buttonStyle(.borderedProminent).disabled(
          controller.busy || !controller.session.isInitialized
        )
        .accessibilityIdentifier("startGame")
        if let failure = controller.game?.computerMoveFailure {
          Text(failure).foregroundStyle(.red).font(.footnote)
            .accessibilityIdentifier("computerMoveFailure")
        }
        if let error = controller.error ?? controller.session.failure
          ?? controller.snapshot?.failure
        {
          Text(error).foregroundStyle(.red).font(.footnote)
          Button("Retry connection") { Task { await controller.restore() } }
        }
        if let connection = controller.snapshot?.node.synchronization {
          Text(connection).font(.caption).foregroundStyle(.secondary)
        }
      }
      .padding(28).frame(maxWidth: 480).frame(maxWidth: .infinity, maxHeight: .infinity)
      .task { await controller.restore() }
      .onChange(of: phase) { _, value in Task { await controller.lifecycle(value) } }
    }
  }
}
