import CryptoKit
import Darwin
import Foundation
@preconcurrency import JavaScriptCore
import Security

/// JSContext, SQLite handles, and callbacks are accessed only on `queue`.
final class JavaScriptExecutor: NSObject, @unchecked Sendable, URLSessionWebSocketDelegate {
  let queue = DispatchQueue(label: "zerospin.javascript")
  private var context: JSContext!
  private let sqlite: SQLiteHost
  private let inspectionOnly: Bool
  private let networkEnabled: Bool
  private var storageLease: Int32 = -1
  private var timers: [Int: DispatchSourceTimer] = [:]
  private var fetches: [Int: URLSessionDataTask] = [:]
  private var sockets: [Int: URLSessionWebSocketTask] = [:]
  private var replies: [Int: CheckedContinuation<String, any Error>] = [:]
  private var sequence = 0
  private var disposed = false
  private var publish: (@Sendable (String) -> Void)?
  private lazy var network = URLSession(
    configuration: .ephemeral, delegate: self, delegateQueue: nil)

  init(directory: URL, inspectionOnly: Bool = false, networkEnabled: Bool = true, ownedLease: Int32 = -1) {
    sqlite = SQLiteHost(directory: directory)
    self.inspectionOnly = inspectionOnly
    self.networkEnabled = networkEnabled
    self.storageLease = ownedLease
    super.init()
  }
  private static func json(_ value: Any) throws -> String {
    String(
      data: try JSONSerialization.data(
        withJSONObject: value, options: [.fragmentsAllowed, .sortedKeys]), encoding: .utf8)!
  }
  private func complete(_ id: Int, success: Bool, value: Any) {
    guard !disposed, let json = try? Self.json(value), let quoted = try? Self.json(json) else {
      return
    }
    context.evaluateScript("__zerospinComplete(\(id),\(success),\(quoted))")
  }
  private func socketEvent(_ id: Int, type: String, value: [String: Any] = [:]) {
    guard !disposed, let type = try? Self.json(type), let value = try? Self.json(value) else {
      return
    }
    context.evaluateScript("__zerospinSocket(\(id),\(type),\(value))")
  }
  func load(bundle: String, publish: @escaping @Sendable (String) -> Void) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
      queue.async { [self] in
        guard !self.disposed, self.context == nil else {
          continuation.resume(throwing: HostError.message("Runtime cannot be loaded twice or after disposal"))
          return
        }
        do {
          try FileManager.default.createDirectory(
            at: self.sqlite.directory, withIntermediateDirectories: true)
          if self.storageLease < 0 {
            let lease = Darwin.open(
              self.sqlite.directory.appendingPathComponent(".runtime.lock").path, O_CREAT | O_RDWR,
              0o600)
            guard lease >= 0 else { throw HostError.message("Could not open storage ownership lock") }
            guard flock(lease, LOCK_EX | LOCK_NB) == 0 else {
              Darwin.close(lease)
              throw HostError.message("Native storage already has a live runtime owner")
            }
            self.storageLease = lease
          }
          self.publish = publish
          self.context = JSContext()
          guard self.context != nil else {
            throw HostError.message("JavaScriptCore could not initialize")
          }
          self.context.exceptionHandler = { _, exception in
            NSLog("Zerospin JavaScript exception: %@", exception?.toString() ?? "unknown")
          }
          let host: @convention(block) (String) -> String = { [weak self] request in
            do {
              guard let self, let data = request.data(using: .utf8),
                let input = try JSONSerialization.jsonObject(with: data) as? [String: Any]
              else {
                throw HostError.message("Invalid host request")
              }
              return try Self.json(["value": try self.host(input)])
            } catch {
              return (try? Self.json(["error": error.localizedDescription]))
                ?? "{\"error\":\"Host failed\"}"
            }
          }
          self.context.setObject(host, forKeyedSubscript: "__zerospinHost" as NSString)
          let reply: @convention(block) (Int, Bool, String) -> Void = {
            [weak self] id, success, value in
            guard let continuation = self?.replies.removeValue(forKey: id) else { return }
            if success {
              continuation.resume(returning: value)
            } else {
              continuation.resume(throwing: HostError.message(value))
            }
          }
          self.context.setObject(reply, forKeyedSubscript: "__zerospinReply" as NSString)
          let observe: @convention(block) (String) -> Void = { [weak self] value in
            self?.publish?(value)
          }
          self.context.setObject(observe, forKeyedSubscript: "__zerospinPublish" as NSString)
          guard let url = Bundle.module.url(forResource: "host.bundle", withExtension: "js") else {
            throw HostError.message("Native host bootstrap resource is missing")
          }
          self.context.evaluateScript(
            try String(contentsOf: url, encoding: .utf8), withSourceURL: url)
          if let error = self.context.exception { throw HostError.message(error.toString()) }
          self.context.evaluateScript(bundle)
          if let error = self.context.exception { throw HostError.message(error.toString()) }
          continuation.resume()
        } catch {
          self.close()
          continuation.resume(throwing: error)
        }
      }
    }
  }
  func invoke(_ method: String, arguments: String = "[]", global: String = "ZerospinApp") async throws -> String {
    try await withCheckedThrowingContinuation { continuation in
      queue.async {
        guard !self.disposed, self.context != nil else {
          continuation.resume(throwing: HostError.message("Runtime is disposed"))
          return
        }
        do {
          guard let data = arguments.data(using: .utf8),
            try JSONSerialization.jsonObject(with: data) is [Any]
          else { throw HostError.message("Arguments must be a JSON array") }
          self.sequence += 1
          let id = self.sequence
          self.replies[id] = continuation
          let name = try Self.json(method)
          let globalName = try Self.json(global)
          self.context.evaluateScript(
            "Promise.resolve().then(() => globalThis[\(globalName)][\(name)](...\(arguments))).then(value => __zerospinReply(\(id),true,JSON.stringify(value ?? null)), error => __zerospinReply(\(id),false,JSON.stringify({message:String(error?.message ?? error),code:error?.code ?? null})))"
          )
          if let error = self.context.exception {
            self.replies.removeValue(forKey: id)?.resume(
              throwing: HostError.message(error.toString()))
          }
        } catch { continuation.resume(throwing: error) }
      }
    }
  }

  /// Snapshot SQLite and other durable files on the runtime's serialized queue.
  func captureStorage() async throws -> [SystemStorageFile] {
    try await withCheckedThrowingContinuation { continuation in
      queue.async { [self] in
        do {
          guard !disposed, context != nil, storageLease >= 0 else {
            throw HostError.message("System runtime does not own its storage")
          }
          continuation.resume(returning: try sqlite.captureStorage())
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  private func host(_ request: [String: Any]) throws -> Any {
    guard !disposed else { throw HostError.message("Runtime is disposed") }
    if inspectionOnly, let kind = request["kind"] as? String,
      ["sqlite", "fetch", "socket", "socketSend", "socketClose"].contains(kind)
    {
      throw HostError.message("System inspection cannot access storage or network")
    }
    if !networkEnabled, let kind = request["kind"] as? String,
      ["fetch", "socket", "socketSend", "socketClose"].contains(kind)
    {
      throw HostError.message("System preflight cannot access the network")
    }
    let id = request["id"] as? Int ?? 0
    switch request["kind"] as? String {
    case "sqlite": return try sqlite.invoke(request)
    case "log":
      NSLog("Zerospin: %@", request["message"] as? String ?? "")
      return NSNull()
    case "clock": return ProcessInfo.processInfo.systemUptime * 1000
    case "encode": return Array((request["value"] as? String ?? "").utf8)
    case "decode": return String(decoding: request["bytes"] as? [UInt8] ?? [], as: UTF8.self)
    case "uuid": return UUID().uuidString.lowercased()
    case "random":
      let length = request["length"] as? Int ?? 0
      guard (0...65536).contains(length) else {
        throw HostError.message("Invalid random byte length")
      }
      var bytes = [UInt8](repeating: 0, count: length)
      guard SecRandomCopyBytes(kSecRandomDefault, length, &bytes) == errSecSuccess else {
        throw HostError.message("Random generation failed")
      }
      return bytes
    case "digest": return Array(SHA256.hash(data: Data(request["bytes"] as? [UInt8] ?? [])))
    case "url":
      let base = (request["base"] as? String).flatMap(URL.init(string:))
      guard let url = URL(string: request["value"] as? String ?? "", relativeTo: base)?.absoluteURL,
        let parts = URLComponents(url: url, resolvingAgainstBaseURL: true),
        let scheme = parts.scheme, let host = parts.host
      else { throw HostError.message("Invalid URL") }
      return [
        "protocol": scheme + ":", "host": host + (parts.port.map { ":\($0)" } ?? ""),
        "pathname": parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath,
        "search": parts.percentEncodedQuery.map { "?" + $0 } ?? "",
        "hash": parts.percentEncodedFragment.map { "#" + $0 } ?? "",
      ]
    case "query":
      var parts = URLComponents()
      parts.percentEncodedQuery = request["value"] as? String ?? ""
      return (parts.queryItems ?? []).map { [$0.name, $0.value ?? ""] }
    case "encodeQuery":
      var parts = URLComponents()
      parts.queryItems = (request["values"] as? [[String]] ?? []).map {
        URLQueryItem(name: $0[0], value: $0[1])
      }
      return parts.percentEncodedQuery ?? ""
    case "timer":
      let timer = DispatchSource.makeTimerSource(queue: queue)
      let delay = max(request["delay"] as? Double ?? 0, 0) / 1000
      let repeating = request["repeat"] as? Bool ?? false
      timer.schedule(deadline: .now() + delay, repeating: repeating ? max(delay, 0.001) : .infinity)
      timer.setEventHandler { [weak self] in
        guard let self, !self.disposed else { return }
        if !repeating { self.timers.removeValue(forKey: id)?.cancel() }
        self.context.evaluateScript("__zerospinTimer(\(id))")
      }
      timers[id] = timer
      timer.resume()
      return NSNull()
    case "cancelTimer":
      timers.removeValue(forKey: id)?.cancel()
      return NSNull()
    case "fetch":
      guard let url = URL(string: request["url"] as? String ?? ""),
        ["http", "https"].contains(url.scheme)
      else { throw HostError.message("Invalid HTTP URL") }
      var input = URLRequest(url: url)
      input.httpMethod = request["method"] as? String ?? "GET"
      input.httpBody = (request["body"] as? String)?.data(using: .utf8)
      for (key, value) in request["headers"] as? [String: String] ?? [:] {
        input.setValue(value, forHTTPHeaderField: key)
      }
      let task = network.dataTask(with: input) { [weak self] data, response, error in
        guard let self else { return }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let headers =
          (response as? HTTPURLResponse)?.allHeaderFields.reduce(into: [String: String]()) {
            $0[String(describing: $1.key)] = String(describing: $1.value)
          } ?? [:]
        let body = String(data: data ?? Data(), encoding: .utf8) ?? ""
        let failure = error?.localizedDescription
        self.queue.async {
          self.fetches.removeValue(forKey: id)
          if let failure {
            self.complete(id, success: false, value: ["message": failure])
          } else {
            self.complete(
              id, success: true, value: ["status": status, "headers": headers, "body": body])
          }
        }
      }
      fetches[id] = task
      task.resume()
      return NSNull()
    case "cancelFetch":
      fetches.removeValue(forKey: id)?.cancel()
      return NSNull()
    case "socket":
      guard let url = URL(string: request["url"] as? String ?? ""),
        ["ws", "wss"].contains(url.scheme)
      else { throw HostError.message("Invalid WebSocket URL") }
      let socket = network.webSocketTask(with: url)
      sockets[id] = socket
      socket.resume()
      receive(socket, id: id)
      return NSNull()
    case "socketSend":
      guard let socket = sockets[id] else { throw HostError.message("WebSocket is closed") }
      socket.send(.string(request["data"] as? String ?? "")) { [weak self] error in
        if let error {
          let message = error.localizedDescription
          self?.queue.async { [weak self] in
            self?.socketEvent(id, type: "error", value: ["message": message])
          }
        }
      }
      return NSNull()
    case "socketClose":
      sockets.removeValue(forKey: id)?.cancel(with: .normalClosure, reason: nil)
      return NSNull()
    default: throw HostError.message("Unknown native service")
    }
  }
  private func receive(_ socket: URLSessionWebSocketTask, id: Int) {
    socket.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(let message):
        let text: String
        switch message {
        case .string(let value): text = value
        case .data(let data): text = String(decoding: data, as: UTF8.self)
        @unknown default: text = ""
        }
        self.queue.async {
          guard !self.disposed, self.sockets[id] === socket else { return }
          self.socketEvent(id, type: "message", value: ["data": text])
          self.receive(socket, id: id)
        }
      case .failure(let error):
        let failure = error.localizedDescription
        self.queue.async {
          guard self.sockets.removeValue(forKey: id) != nil else { return }
          self.socketEvent(id, type: "error", value: ["message": failure])
          self.socketEvent(id, type: "close")
        }
      }
    }
  }
  func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didOpenWithProtocol protocol: String?
  ) {
    queue.async {
      if let id = self.sockets.first(where: { $0.value === webSocketTask })?.key {
        self.socketEvent(id, type: "open")
      }
    }
  }
  func urlSession(
    _ session: URLSession, webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?
  ) {
    queue.async {
      if let id = self.sockets.first(where: { $0.value === webSocketTask })?.key {
        self.sockets.removeValue(forKey: id)
        self.socketEvent(id, type: "close")
      }
    }
  }
  private func close() {
    disposed = true
    for timer in timers.values { timer.cancel() }
    timers.removeAll()
    for task in fetches.values { task.cancel() }
    fetches.removeAll()
    for socket in sockets.values { socket.cancel(with: .goingAway, reason: nil) }
    sockets.removeAll()
    network.invalidateAndCancel()
    for reply in replies.values { reply.resume(throwing: HostError.message("Runtime disposed")) }
    replies.removeAll()
    sqlite.close()
    if storageLease >= 0 {
      flock(storageLease, LOCK_UN)
      Darwin.close(storageLease)
      storageLease = -1
    }
    context = nil
    publish = nil
  }
  func dispose() async {
    await withCheckedContinuation { continuation in
      queue.async {
        self.close()
        continuation.resume()
      }
    }
  }
}
