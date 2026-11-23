import Foundation
import Observation

/// One native lifetime joins initialization and fences every queued publication before teardown.
@Observable @MainActor public final class Session {
  public private(set) var snapshotJSON = "null"
  public private(set) var failure: String?
  public private(set) var isInitialized = false
  private enum Phase { case idle, starting, active, closing, closed }
  private struct Initialization {
    let id: UUID
    let bundleURL: URL
    let configurationJSON: String
    let task: Task<Void, any Error>
  }
  @ObservationIgnored private let executor: JavaScriptExecutor
  @ObservationIgnored private var phase = Phase.idle
  @ObservationIgnored private var lifetime: UUID? = UUID()
  @ObservationIgnored private var loadTask: Task<Void, any Error>?
  @ObservationIgnored private var loadedBundleURL: URL?
  @ObservationIgnored private var contextLoaded = false
  @ObservationIgnored private var initialization: Initialization?
  @ObservationIgnored private var disposalTask: Task<Void, Never>?

  public init(storageDirectory: URL) { executor = JavaScriptExecutor(directory: storageDirectory) }

  public func initialize(bundleURL: URL, configurationJSON: String) async throws {
    guard phase != .closing, phase != .closed, let lifetime else {
      throw HostError.message("Session is disposed")
    }
    let bundleURL = bundleURL.standardizedFileURL
    let configuration = try JSONSerialization.jsonObject(
      with: Data(configurationJSON.utf8), options: .fragmentsAllowed)
    guard let configurationJSON = String(
      data: try JSONSerialization.data(
        withJSONObject: configuration, options: [.fragmentsAllowed, .sortedKeys]),
      encoding: .utf8)
    else { throw HostError.message("Invalid configuration JSON") }
    if let loadedBundleURL, loadedBundleURL != bundleURL {
      throw HostError.message("Native bundle differs from its loaded binding")
    }
    if let initialization {
      guard initialization.bundleURL == bundleURL,
        initialization.configurationJSON == configurationJSON
      else { throw HostError.message("Native configuration differs from its opening binding") }
      try await initialization.task.value
      return
    }
    phase = .starting
    let requestID = UUID()
    let task = Task { [self] in
      if loadTask == nil {
        let bundle = try String(contentsOf: bundleURL, encoding: .utf8)
        loadedBundleURL = bundleURL
        loadTask = Task { [executor] in
          try await executor.load(bundle: bundle) { [weak self] value in
            Task { @MainActor in
              guard let self, self.lifetime == lifetime,
                self.phase != .closing, self.phase != .closed
              else { return }
              self.snapshotJSON = value
            }
          }
        }
      }
      try await loadTask?.value
      contextLoaded = true
      try Task.checkCancellation()
      guard self.lifetime == lifetime, phase != .closing, phase != .closed else {
        throw HostError.message("Session initialization canceled")
      }
      _ = try await executor.invoke("initialize", arguments: "[\(configurationJSON)]")
      try Task.checkCancellation()
      guard self.lifetime == lifetime, phase != .closing, phase != .closed else {
        throw HostError.message("Session initialization canceled")
      }
      phase = .active
      isInitialized = true
      failure = nil
    }
    initialization = Initialization(
      id: requestID, bundleURL: bundleURL, configurationJSON: configurationJSON, task: task)
    defer {
      if initialization?.id == requestID { initialization = nil }
    }
    do { try await task.value }
    catch {
      if self.lifetime == lifetime, phase != .closing, phase != .closed {
        // A loaded context survives an application initialization failure and can retry.
        if loadTask != nil, !contextLoaded {
          phase = .closed
          self.lifetime = nil
        } else {
          phase = contextLoaded ? .active : .idle
        }
        failure = error.localizedDescription
      }
      throw error
    }
  }

  private func invokeActive(_ method: String, arguments: String = "[]") async throws -> String {
    guard phase == .active, let lifetime else { throw HostError.message("Session is unavailable") }
    let value = try await executor.invoke(method, arguments: arguments)
    guard self.lifetime == lifetime, phase == .active else {
      throw HostError.message("Session is disposed")
    }
    return value
  }

  @discardableResult public func stage(contractName: String, payloadJSON: String) async throws -> String {
    guard isInitialized else { throw HostError.message("Session is unavailable") }
    guard let name = String(
      data: try JSONSerialization.data(withJSONObject: contractName, options: .fragmentsAllowed),
      encoding: .utf8)
    else { throw HostError.message("Invalid contract name") }
    let result = try await invokeActive("stage", arguments: "[\(name),\(payloadJSON)]")
    if let data = result.data(using: .utf8),
      let value = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      value["_tag"] as? String == "Failure"
    {
      failure = (value["failure"] as? [String: Any])?["message"] as? String ?? "Command failed"
    } else { failure = nil }
    return result
  }
  public func resume() async throws { _ = try await invokeActive("resume") }
  public func suspend() async throws { _ = try await invokeActive("suspend") }
  public func pushNow() async throws { _ = try await invokeActive("pushNow") }
  public func clearAuthentication() async throws {
    _ = try await invokeActive("clearAuthentication")
    isInitialized = false
    snapshotJSON = "null"
  }
  public func dispose() async {
    if let disposalTask { await disposalTask.value; return }
    phase = .closing
    lifetime = nil
    isInitialized = false
    snapshotJSON = "null"
    initialization?.task.cancel()
    let starting = initialization?.task
    let loading = loadTask
    let task = Task { [self] in
      var loaded = false
      var cleanupFailure: String?
      if let loading {
        do { try await loading.value; loaded = true } catch {}
      }
      // JavaScript retires local remote waits and drains accepted SQL before host destruction.
      if loaded {
        do { _ = try await executor.invoke("dispose") }
        catch { cleanupFailure = error.localizedDescription }
      }
      _ = try? await starting?.value
      await executor.dispose()
      phase = .closed
      if let cleanupFailure { failure = cleanupFailure }
    }
    disposalTask = task
    await task.value
  }
}
