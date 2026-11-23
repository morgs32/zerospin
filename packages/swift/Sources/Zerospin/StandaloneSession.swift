import Foundation

/// Owns one local JavaScript runtime and its exclusive storage directory.
@MainActor public final class StandaloneSession {
  public private(set) var snapshotJSON: String

  private let executor: JavaScriptExecutor
  private var operation: Task<String, any Error>?
  private var disposal: Task<Void, Never>?

  private init(executor: JavaScriptExecutor, snapshotJSON: String) {
    self.executor = executor
    self.snapshotJSON = snapshotJSON
  }

  public static func initialize(
    bundleURL: URL, storageDirectory: URL, configurationJSON: String
  ) async throws -> StandaloneSession {
    let configuration = try JSONSerialization.jsonObject(
      with: Data(configurationJSON.utf8), options: [.fragmentsAllowed])
    let arguments = try argumentsJSON([configuration])
    let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
    let executor = JavaScriptExecutor(directory: storageDirectory)
    do {
      try await executor.load(bundle: bundle) { _ in }
      try Task.checkCancellation()
      let snapshot = try await executor.invoke("initialize", arguments: arguments)
      try Task.checkCancellation()
      return StandaloneSession(executor: executor, snapshotJSON: snapshot)
    } catch {
      _ = try? await executor.invoke("dispose")
      await executor.dispose()
      throw error
    }
  }

  /// Returns the command result and updates the committed snapshot from the same reply.
  public func execute(commandName: String, payloadJSON: String) async throws -> String {
    let payload = try JSONSerialization.jsonObject(
      with: Data(payloadJSON.utf8), options: [.fragmentsAllowed])
    let responseJSON = try await invoke(
      "submit", arguments: Self.argumentsJSON([commandName, payload]))
    guard disposal == nil else { throw HostError.message("Standalone session is disposed") }
    guard
      let response = try JSONSerialization.jsonObject(with: Data(responseJSON.utf8))
        as? [String: Any],
      let result = response["result"] as? [String: Any],
      let snapshot = response["snapshot"] as? [String: Any]
    else { throw HostError.message("Invalid standalone command response") }
    let resultJSON = try JSONSerialization.data(withJSONObject: result)
    let snapshotData = try JSONSerialization.data(withJSONObject: snapshot)
    snapshotJSON = String(decoding: snapshotData, as: UTF8.self)
    return String(decoding: resultJSON, as: UTF8.self)
  }

  private static func argumentsJSON(_ arguments: [Any]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: arguments)
    return String(decoding: data, as: UTF8.self)
  }

  private func invoke(_ method: String, arguments: String) async throws -> String {
    guard disposal == nil else { throw HostError.message("Standalone session is disposed") }
    guard operation == nil else {
      throw HostError.message("A standalone session operation is already running")
    }
    let current = Task { [executor] in
      try await executor.invoke(method, arguments: arguments)
    }
    operation = current
    defer { operation = nil }
    return try await current.value
  }

  public func dispose() async {
    if let disposal {
      await disposal.value
      return
    }
    let current = operation
    let closing = Task { [executor] in
      _ = try? await current?.value
      _ = try? await executor.invoke("dispose")
      await executor.dispose()
    }
    disposal = closing
    await closing.value
  }
}
