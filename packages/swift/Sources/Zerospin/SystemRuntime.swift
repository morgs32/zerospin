import Darwin
import Foundation

/// One file in a consistent snapshot of the System's durable storage.
public struct SystemStorageFile: Sendable {
  public let name: String
  public let data: Data
}

/// Runs an installed System in one serialized JavaScriptCore owner.
@MainActor public final class SystemRuntime {
  public let inspectionJSON: String
  public let initializationJSON: String
  private let executor: JavaScriptExecutor
  private var operation: Task<String, any Error>?
  private var capture: Task<[SystemStorageFile], any Error>?
  private var closing: Task<Void, Never>?

  private init(executor: JavaScriptExecutor, inspectionJSON: String, initializationJSON: String) {
    self.executor = executor
    self.inspectionJSON = inspectionJSON
    self.initializationJSON = initializationJSON
  }

  /// Evaluate declarations without allowing the candidate to access storage or networking.
  public static func inspect(_ package: SystemPackage) async throws -> String {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "zerospin-inspection-\(UUID().uuidString)", isDirectory: true)
    let executor = JavaScriptExecutor(directory: directory, inspectionOnly: true)
    do {
      try await executor.load(bundle: package.bundle) { _ in }
      let inspection = try await executor.invoke("inspect", global: "ZerospinSystem")
      guard let inspectionData = inspection.data(using: .utf8),
        let details = try JSONSerialization.jsonObject(with: inspectionData) as? [String: Any],
        details["systemName"] as? String == package.manifest.systemName,
        let actualSpec = details["systemSpec"] as? [String: Any],
        actualSpec["hash"] as? String == package.manifest.systemSpecHash,
        let expectedSpec = try JSONSerialization.jsonObject(with: package.systemSpec) as? [String: Any],
        NSDictionary(dictionary: actualSpec).isEqual(to: expectedSpec)
      else { throw HostError.message("System package declarations do not match its executable") }
      await executor.dispose()
      try? FileManager.default.removeItem(at: directory)
      return inspection
    } catch {
      await executor.dispose()
      try? FileManager.default.removeItem(at: directory)
      throw error
    }
  }

  public static func open(
    package: SystemPackage, storageDirectory: URL, systemId: String,
    requireExistingStorage: Bool = false
  ) async throws -> SystemRuntime {
    guard !systemId.isEmpty else { throw HostError.message("System ID is required") }
    let inspection = try await inspect(package)
    let lease: Int32
    if requireExistingStorage {
      lease = try await preflightExisting(package: package, storageDirectory: storageDirectory, systemId: systemId)
    } else {
      if FileManager.default.fileExists(atPath: storageDirectory.path),
        !(try FileManager.default.contentsOfDirectory(atPath: storageDirectory.path)).isEmpty
      {
        throw HostError.message("System storage already exists; reopen it explicitly")
      }
      try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
      lease = -1
    }
    let executor = JavaScriptExecutor(directory: storageDirectory, ownedLease: lease)
    do {
      #if os(iOS)
        try FileManager.default.setAttributes(
          [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
          ofItemAtPath: storageDirectory.path)
      #endif
      try await executor.load(bundle: package.bundle) { _ in }
      let initialization = try await executor.invoke(
        "initialize", arguments: arguments(["systemId": systemId, "requireExistingStorage": requireExistingStorage]), global: "ZerospinSystem")
      try validateInitialization(initialization, package: package)
      return SystemRuntime(executor: executor, inspectionJSON: inspection, initializationJSON: initialization)
    } catch {
      await executor.dispose()
      throw error
    }
  }

  public func execute(aggregateId: String, commandName: String, payloadJSON: String) async throws -> String {
    guard !aggregateId.isEmpty, !commandName.isEmpty,
      let payloadData = payloadJSON.data(using: .utf8)
    else { throw HostError.message("Aggregate ID, command name, and payload are required") }
    let payload = try JSONSerialization.jsonObject(with: payloadData, options: [.fragmentsAllowed])
    return try await invoke(
      "execute", arguments: Self.arguments(["aggregateId": aggregateId, "commandName": commandName, "payload": payload]))
  }

  public func snapshot(aggregateId: String) async throws -> String {
    guard !aggregateId.isEmpty else { throw HostError.message("Aggregate ID is required") }
    return try await invoke("snapshot", arguments: Self.arguments(["aggregateId": aggregateId]))
  }

  /// Capture every durable file while this runtime holds its storage lease.
  public func captureStorage() async throws -> [SystemStorageFile] {
    guard closing == nil else { throw HostError.message("System runtime is disposed") }
    guard operation == nil && capture == nil else { throw HostError.message("System runtime is busy") }
    let task = Task { [executor] in try await executor.captureStorage() }
    capture = task
    defer { capture = nil }
    return try await task.value
  }

  public func dispose() async {
    if let closing { await closing.value; return }
    let current = operation
    let currentCapture = capture
    let task = Task { [executor] in
      _ = try? await current?.value
      _ = try? await currentCapture?.value
      _ = try? await executor.invoke("dispose", global: "ZerospinSystem")
      await executor.dispose()
    }
    closing = task
    await task.value
  }

  private func invoke(_ method: String, arguments: String) async throws -> String {
    guard closing == nil else { throw HostError.message("System runtime is disposed") }
    guard operation == nil && capture == nil else { throw HostError.message("System runtime is busy") }
    let task = Task { [executor] in
      try await executor.invoke(method, arguments: arguments, global: "ZerospinSystem")
    }
    operation = task
    defer { operation = nil }
    return try await task.value
  }

  private static func arguments(_ value: [String: Any]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: [value], options: [.sortedKeys])
    guard let result = String(data: data, encoding: .utf8) else { throw HostError.message("Invalid System arguments") }
    return result
  }

  private static func validateInitialization(_ value: String, package: SystemPackage) throws {
    guard let data = value.data(using: .utf8),
      let details = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      details["systemName"] as? String == package.manifest.systemName,
      let actualSpec = details["systemSpec"] as? [String: Any],
      actualSpec["hash"] as? String == package.manifest.systemSpecHash,
      let expectedSpec = try JSONSerialization.jsonObject(with: package.systemSpec) as? [String: Any],
      NSDictionary(dictionary: actualSpec).isEqual(to: expectedSpec),
      let aggregateName = details["aggregateName"] as? String, !aggregateName.isEmpty,
      let aggregateVersion = details["aggregateVersion"] as? Int, aggregateVersion > 0,
      let commands = details["commands"] as? [[String: Any]],
      commands.allSatisfy({
        guard let name = $0["name"] as? String, !name.isEmpty,
          let version = $0["version"] as? Int, version > 0,
          $0["payloadShape"] is [String: Any] else { return false }
        return true
      }),
      let failures = details["recoveryFailures"] as? [[String: Any]],
      failures.allSatisfy({
        guard let aggregateId = $0["aggregateId"] as? String, !aggregateId.isEmpty,
          let commandId = $0["commandId"] as? String, !commandId.isEmpty,
          let aggregateIndex = $0["aggregateIndex"] as? Int, aggregateIndex > 0,
          $0["message"] is String else { return false }
        return true
      })
    else { throw HostError.message("System package initialization does not match the supported host interface") }
  }

  /// Run candidate startup against an isolated copy before touching an existing store.
  private static func preflightExisting(
    package: SystemPackage, storageDirectory: URL, systemId: String
  ) async throws -> Int32 {
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: storageDirectory.path, isDirectory: &isDirectory),
      isDirectory.boolValue
    else { throw HostError.message("Existing System storage is missing") }
    let lockPath = storageDirectory.appendingPathComponent(".runtime.lock").path
    let lease = Darwin.open(lockPath, O_RDONLY)
    guard lease >= 0 else { throw HostError.message("Existing System storage ownership lock is missing") }
    if flock(lease, LOCK_EX | LOCK_NB) != 0 {
      Darwin.close(lease)
      throw HostError.message("System storage already has a live runtime owner")
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
      "zerospin-preflight-\(UUID().uuidString)", isDirectory: true)
    do {
      try FileManager.default.copyItem(at: storageDirectory, to: directory)
    } catch {
      flock(lease, LOCK_UN)
      Darwin.close(lease)
      try? FileManager.default.removeItem(at: directory)
      throw error
    }
    let executor = JavaScriptExecutor(directory: directory, networkEnabled: false)
    do {
      try await executor.load(bundle: package.bundle) { _ in }
      let initialization = try await executor.invoke(
        "initialize", arguments: arguments(["systemId": systemId, "requireExistingStorage": true]),
        global: "ZerospinSystem")
      try validateInitialization(initialization, package: package)
      _ = try? await executor.invoke("dispose", global: "ZerospinSystem")
      await executor.dispose()
      try? FileManager.default.removeItem(at: directory)
      return lease
    } catch {
      await executor.dispose()
      try? FileManager.default.removeItem(at: directory)
      flock(lease, LOCK_UN)
      Darwin.close(lease)
      throw error
    }
  }
}
