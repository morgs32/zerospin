import Foundation
import Observation
import Zerospin

struct SystemCommand: Decodable, Identifiable {
  let name: String
  let version: Int
  var id: String { "\(name)@\(version)" }
}

struct SystemInspection: Decodable {
  let systemName: String
  let aggregateName: String
  let aggregateVersion: Int
  let commands: [SystemCommand]
}

struct SystemRecoveryFailure: Decodable, Identifiable {
  let aggregateId: String
  let commandId: String
  let aggregateIndex: Int
  let message: String
  var id: String { commandId }
}

struct SystemInitialization: Decodable {
  let recoveryFailures: [SystemRecoveryFailure]
}

struct GitHubRelease: Decodable, Identifiable {
  struct Asset: Decodable {
    let name: String
    let browser_download_url: URL
  }
  let id: Int
  let tag_name: String
  let name: String?
  let prerelease: Bool
  let assets: [Asset]
  var package: Asset? { assets.first { $0.name == "zerospin-system.zip" } }
}

struct InstalledSystem: Identifiable {
  let id: String
  let systemName: String
  let repository: String
  var backupStatus: String
}

private struct ConsoleState {
  var aggregateId = ""
  var commandName = ""
  var payload = "{}"
  var outcome = ""
  var resources = ""
}

@MainActor @Observable final class SystemStore {
  var systems: [InstalledSystem] = []
  var selectedSystemId: String?
  var repository = ""
  var releases: [GitHubRelease] = []
  var inspection: SystemInspection?
  var aggregateId = ""
  var commandName = ""
  var payload = "{}"
  var outcome = ""
  var resources = ""
  var recoveryFailures: [SystemRecoveryFailure] = []
  var error: String?
  var backupStatus = "No backup yet"
  var restoreFailures: [String] = []
  var isBusy = false
  var hasBackup = false
  var hasCheckedCloudAccount: Bool { checkedCloudAccount != nil }
  var canInstallSystem: Bool { checkedCloudAccount != nil && !hasBackup && localScanSucceeded }

  private var installation: SystemInstallation?
  private var package: SystemPackage?
  private var runtime: SystemRuntime?
  private var consoleStates: [String: ConsoleState] = [:]
  private var pendingBackups: [String: PendingSystemBackup] = [:]
  private var pendingBackupMarkers: [String: String] = [:]
  private var uploadTasks: [String: Task<Void, Never>] = [:]
  private var checkedCloudAccount: String?
  private var cloudUsable = false
  private var localScanSucceeded = false
  private let cloud = SystemBackupStore()
  private let files = FileManager.default
  private var support: URL { files.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0] }
  private var root: URL { support.appendingPathComponent("InstalledSystems", isDirectory: true) }
  private func directory(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }
  private func storage(_ id: String) -> URL { directory(id).appendingPathComponent("storage", isDirectory: true) }
  private func pendingMarker(_ id: String) -> URL { directory(id).appendingPathComponent("backup-needed") }
  private func conflictMarker(_ id: String) -> URL { directory(id).appendingPathComponent("backup-conflict") }
  private func baselineFile(_ id: String) -> URL { directory(id).appendingPathComponent("backup-baseline.json") }
  private func pendingRevisionFile(_ id: String, sequence: Int64) -> URL {
    directory(id).appendingPathComponent("backup-revision-\(sequence).json")
  }

  func open() async {
    guard !isBusy else { return }
    isBusy = true
    defer { isBusy = false }
    do {
      try createDirectory(root)
      try loadSystems()
      await refreshCloud()
      await capturePendingSystems()
    } catch {
      localScanSucceeded = false
      self.error = error.localizedDescription
    }
  }

  func foreground() async {
    if systems.isEmpty && selectedSystemId == nil { await open(); return }
    guard !isBusy else { return }
    isBusy = true
    defer { isBusy = false }
    await refreshCloud()
    if let id = selectedSystemId, files.fileExists(atPath: pendingMarker(id).path) {
      do { try await captureBackup() }
      catch { setBackupStatus(id, "Backup pending: \(error.localizedDescription)") }
    } else { await capturePendingSystems() }
    for id in Array(pendingBackups.keys) { startUpload(id) }
  }

  func accountChanged() async {
    checkedCloudAccount = nil
    await foreground()
  }

  func checkCloud() async {
    guard !isBusy else { return }
    isBusy = true
    defer { isBusy = false }
    await refreshCloud()
    await capturePendingSystems()
  }

  private func refreshCloud() async {
    checkedCloudAccount = nil
    cloudUsable = false
    do {
      let account = try await cloud.accountIdentifier()
      for system in systems {
        guard let bound = try loadCloudAccount(from: directory(system.id)), bound == account else {
          throw StoreError.message("The iCloud account does not match the account bound to \(system.systemName).")
        }
      }
      let discovery = try await cloud.downloadAll(account: account)
      let installedIds = Set(systems.map(\.id))
      let missing = discovery.backups.filter { !installedIds.contains($0.installation.systemId) }
      var failures = discovery.failures
      for backup in discovery.backups where installedIds.contains(backup.installation.systemId) {
        let local = try loadInstallation(from: directory(backup.installation.systemId))
        if backup.installation.backupSequence > local.backupSequence {
          try quarantine(local.systemId)
        }
      }
      if failures.isEmpty {
        for system in systems where uploadTasks[system.id] == nil {
          let local = try loadInstallation(from: directory(system.id))
          let current = try await cloud.revision(systemId: system.id, account: account)
          let baselineURL = baselineFile(system.id)
          if !files.fileExists(atPath: baselineURL.path) {
            if let current, current.sequence > local.backupSequence { try quarantine(system.id) }
            else { try writeBaseline(current, id: system.id) }
          } else {
            let baseline = try readBaseline(system.id)
            if baseline != current {
              // A durable pending revision proves this device produced a save
              // whose acknowledgement was interrupted before the baseline write.
              if let current, try isPendingRevision(current, id: system.id) {
                try writeBaseline(current, id: system.id)
                try? removeVerifiedRevisions(system.id, through: current.sequence)
              } else { try quarantine(system.id) }
            }
          }
        }
      }
      for system in systems where files.fileExists(atPath: conflictMarker(system.id).path) {
        failures.append("iCloud has a conflicting backup for \(system.repository); the local System was not replaced. Preserve both copies and resolve the conflict before using this System.")
        setBackupStatus(system.id, "Backup conflict: preserve both copies")
      }
      restoreFailures = failures
      hasBackup = !missing.isEmpty || !failures.isEmpty
      checkedCloudAccount = account
      cloudUsable = discovery.failures.isEmpty
      if selectedSystemId == nil { backupStatus = hasBackup ? "iCloud Systems need restoration or attention" : "iCloud backup check complete" }
    } catch {
      hasBackup = true
      backupStatus = "iCloud unavailable: \(error.localizedDescription)"
    }
  }

  func selectSystem(id: String) async {
    guard !isBusy, systems.contains(where: { $0.id == id }) else { return }
    guard !files.fileExists(atPath: conflictMarker(id).path) else {
      error = "This System has an iCloud backup conflict. Preserve both copies before resolving it."
      return
    }
    isBusy = true
    defer { isBusy = false }
    do {
      await closeRuntime()
      let installed = try loadInstallation(from: directory(id))
      let package = try loadPackage(from: directory(id), expected: installed.packageDigest)
      try markNeedsCapture(id)
      try await openRuntime(package, installed, at: storage(id))
      selectedSystemId = id
      let saved = consoleStates[id] ?? ConsoleState()
      aggregateId = saved.aggregateId
      commandName = inspection?.commands.contains(where: { $0.name == saved.commandName }) == true
        ? saved.commandName : (inspection?.commands.first?.name ?? "")
      payload = saved.payload
      outcome = saved.outcome
      resources = saved.resources
      backupStatus = systems.first(where: { $0.id == id })?.backupStatus ?? "Backup pending"
      do { try await captureBackup() }
      catch { setBackupStatus(id, "Backup pending: \(error.localizedDescription)") }
    } catch { self.error = error.localizedDescription }
  }

  func closeSystem() async {
    guard !isBusy else { return }
    isBusy = true
    defer { isBusy = false }
    await closeRuntime()
    backupStatus = hasBackup ? "iCloud Systems need restoration or attention" : "iCloud backup check complete"
  }

  private func closeRuntime(saveConsole: Bool = true) async {
    if saveConsole, let id = selectedSystemId {
      consoleStates[id] = ConsoleState(aggregateId: aggregateId, commandName: commandName,
        payload: payload, outcome: outcome, resources: resources)
    }
    if let runtime { await runtime.dispose() }
    runtime = nil
    installation = nil
    package = nil
    inspection = nil
    selectedSystemId = nil
    recoveryFailures = []
    aggregateId = ""
    commandName = ""
    payload = "{}"
    outcome = ""
    resources = ""
  }

  func retryBackup() async {
    guard !isBusy, let id = selectedSystemId else { return }
    guard !files.fileExists(atPath: conflictMarker(id).path) else {
      error = "This System has an iCloud backup conflict. Preserve both copies before resolving it."
      return
    }
    isBusy = true
    defer { isBusy = false }
    do {
      try markNeedsCapture(id)
      try await captureBackup()
    } catch { setBackupStatus(id, "Backup pending: \(error.localizedDescription)") }
  }

  func findReleases() async {
    guard !isBusy else { return }
    isBusy = true
    defer { isBusy = false }
    do {
      let path = try repositoryPath(repository)
      let releasePath = "/repos/\(path)/releases"
      var next: URL? = URL(string: "https://api.github.com\(releasePath)?per_page=100")!
      var visited = Set<URL>()
      var found: [GitHubRelease] = []
      var ids = Set<Int>()
      while let url = next {
        guard url.scheme == "https", url.host == "api.github.com", url.path == releasePath,
          visited.insert(url).inserted
        else { throw StoreError.message("GitHub returned an invalid release pagination link.") }
        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
          throw StoreError.message("GitHub could not load public releases for this repository.")
        }
        for release in try JSONDecoder().decode([GitHubRelease].self, from: data)
        where release.package != nil && ids.insert(release.id).inserted {
          found.append(release)
        }
        next = nil
        if let links = response.value(forHTTPHeaderField: "Link") {
          for link in links.split(separator: ",") where link.contains("rel=\"next\"") {
            guard let start = link.firstIndex(of: "<"), let end = link.firstIndex(of: ">"), start < end,
              let nextURL = URL(string: String(link[link.index(after: start)..<end]))
            else { throw StoreError.message("GitHub returned an invalid release pagination link.") }
            next = nextURL
          }
        }
      }
      releases = found
      if releases.isEmpty { error = "No releases contain zerospin-system.zip." }
    } catch { self.error = error.localizedDescription }
  }

  func install(_ release: GitHubRelease) async {
    guard !isBusy, let asset = release.package else { return }
    guard canInstallSystem, let account = checkedCloudAccount else {
      error = "Check iCloud and restore existing Systems before installing."
      return
    }
    isBusy = true
    defer { isBusy = false }
    let stage = support.appendingPathComponent("SystemStage-\(UUID().uuidString)")
    defer { try? files.removeItem(at: stage) }
    do {
      let path = try repositoryPath(repository)
      guard !systems.contains(where: { (try? repositoryPath($0.repository).lowercased()) == path.lowercased() }) else {
        throw StoreError.message("A System from this GitHub repository is already installed.")
      }
      let repositoryParts = path.split(separator: "/")
      let assetParts = asset.browser_download_url.pathComponents.filter { $0 != "/" }
      guard asset.browser_download_url.scheme == "https", asset.browser_download_url.host == "github.com",
        asset.browser_download_url.query == nil, asset.browser_download_url.fragment == nil,
        assetParts.count >= 6, repositoryParts.count == 2,
        assetParts[0].lowercased() == repositoryParts[0].lowercased(),
        assetParts[1].lowercased() == repositoryParts[1].lowercased(),
        assetParts[2] == "releases", assetParts[3] == "download", !assetParts[4].isEmpty,
        assetParts.last == "zerospin-system.zip"
      else { throw StoreError.message("GitHub returned an unexpected release asset URL.") }
      let (data, response) = try await URLSession.shared.data(from: asset.browser_download_url)
      guard let response = response as? HTTPURLResponse, response.statusCode == 200 else {
        throw StoreError.message("Could not download the selected System package.")
      }
      let package = try SystemPackage(data: data)
      _ = try await SystemRuntime.inspect(package)
      await refreshCloud()
      guard canInstallSystem, checkedCloudAccount == account else {
        throw StoreError.message("Restore existing iCloud Systems and resolve backup errors before installing.")
      }
      let discovery = try await cloud.downloadAll(account: account)
      let installedIds = Set(systems.map(\.id))
      guard discovery.failures.isEmpty, discovery.backups.allSatisfy({ installedIds.contains($0.installation.systemId) }) else {
        hasBackup = true
        throw StoreError.message("Restore existing iCloud Systems and resolve backup errors before installing.")
      }
      guard !discovery.backups.contains(where: { (try? repositoryPath($0.installation.repository).lowercased()) == path.lowercased() }) else {
        throw StoreError.message("A System from this GitHub repository already has an iCloud backup.")
      }
      let installed = SystemInstallation(systemId: "sys_\(UUID().uuidString.lowercased())", repository: repository,
        release: release.tag_name, packageDigest: package.digest, backupSequence: 0)
      try createDirectory(stage)
      try data.write(to: stage.appendingPathComponent("system.zip"), options: .atomic)
      try writeInstallation(installed, to: stage)
      try await cloud.requireAccount(account)
      try writeCloudAccount(account, to: stage)
      try JSONEncoder().encode(Optional<SystemBackupRevision>.none).write(
        to: stage.appendingPathComponent("backup-baseline.json"), options: .atomic)
      let candidate = try await SystemRuntime.open(package: package,
        storageDirectory: stage.appendingPathComponent("storage", isDirectory: true), systemId: installed.systemId)
      await candidate.dispose()
      try Data().write(to: stage.appendingPathComponent("backup-needed"), options: .atomic)
      try await cloud.requireAccount(account)
      guard !files.fileExists(atPath: directory(installed.systemId).path) else {
        throw StoreError.message("A System with this ID is already installed.")
      }
      try files.moveItem(at: stage, to: directory(installed.systemId))
      try loadSystems()
      releases = []
      repository = ""
      await capturePendingSystems()
    } catch { self.error = error.localizedDescription }
  }

  func execute() async {
    guard !isBusy, let runtime, let id = selectedSystemId else { return }
    guard !files.fileExists(atPath: conflictMarker(id).path) else {
      error = "This System has an iCloud backup conflict. Preserve both copies before resolving it."
      return
    }
    isBusy = true
    defer { isBusy = false }
    do { try markNeedsCapture(id) }
    catch { self.error = error.localizedDescription; return }
    setBackupStatus(id, "Backup pending")
    outcome = ""
    do {
      let response = try await runtime.execute(aggregateId: aggregateId, commandName: commandName, payloadJSON: payload)
      guard let data = response.data(using: .utf8),
        let result = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let commandOutcome = result["outcome"], let committedResources = result["resources"]
      else { throw StoreError.message("System returned an invalid command response.") }
      outcome = try prettyJSON(commandOutcome)
      resources = try prettyJSON(committedResources)
    } catch {
      self.error = "The command may have been admitted or executed. Check the System data before retrying; a retry creates a new command. \(error.localizedDescription)"
    }
    do { try await captureBackup() }
    catch { setBackupStatus(id, "Backup pending: \(error.localizedDescription)") }
  }

  func refreshResources() async {
    guard !isBusy, let runtime, let id = selectedSystemId else { return }
    guard !files.fileExists(atPath: conflictMarker(id).path) else {
      error = "This System has an iCloud backup conflict. Preserve both copies before resolving it."
      return
    }
    isBusy = true
    defer { isBusy = false }
    do { try markNeedsCapture(id) }
    catch { self.error = error.localizedDescription; return }
    setBackupStatus(id, "Backup pending")
    do {
      let snapshot = try await runtime.snapshot(aggregateId: aggregateId)
      guard let data = snapshot.data(using: .utf8),
        let result = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        let committedResources = result["resources"]
      else { throw StoreError.message("System returned an invalid snapshot.") }
      resources = try prettyJSON(committedResources)
      if let failure = result["recoveryFailure"] as? [String: Any] {
        let encoded = try JSONSerialization.data(withJSONObject: failure)
        let pending = try JSONDecoder().decode(SystemRecoveryFailure.self, from: encoded)
        recoveryFailures.removeAll { $0.aggregateId == aggregateId }
        recoveryFailures.append(pending)
      } else if result["recoveryFailure"] is NSNull {
        recoveryFailures.removeAll { $0.aggregateId == aggregateId }
      } else { throw StoreError.message("System returned an invalid recovery status.") }
    } catch { self.error = error.localizedDescription }
    do { try await captureBackup() }
    catch { setBackupStatus(id, "Backup pending: \(error.localizedDescription)") }
  }

  func restore() async {
    guard !isBusy, selectedSystemId == nil else { return }
    isBusy = true
    defer { isBusy = false }
    do {
      let account = try await cloud.accountIdentifier()
      let discovery = try await cloud.downloadAll(account: account)
      var failures = discovery.failures
      for system in systems {
        guard let bound = try loadCloudAccount(from: directory(system.id)), bound == account else {
          throw StoreError.message("The iCloud account does not match the account bound to \(system.systemName).")
        }
      }
      for backup in discovery.backups {
        let id = backup.installation.systemId
        if systems.contains(where: { $0.id == id }) {
          do {
            let local = try loadInstallation(from: directory(id))
            if backup.installation.backupSequence > local.backupSequence {
              failures.append("iCloud has a newer backup for \(local.repository); the local System was not replaced.")
            }
          } catch { failures.append("\(backup.installation.repository): \(error.localizedDescription)") }
          continue
        }
        do {
          guard let revision = discovery.revisions[id] else { throw StoreError.message("The backup revision is missing.") }
          try await restore(backup, revision: revision, account: account)
          try loadSystems()
        } catch { failures.append("\(backup.installation.repository): \(error.localizedDescription)") }
      }
      await refreshCloud()
      restoreFailures = failures + restoreFailures
      hasBackup = hasBackup || !failures.isEmpty
      if selectedSystemId == nil {
        backupStatus = restoreFailures.isEmpty ? "iCloud Systems restored" : "Some iCloud Systems need attention"
      }
      await capturePendingSystems()
    } catch {
      hasBackup = true
      checkedCloudAccount = nil
      self.error = error.localizedDescription
    }
  }

  private func restore(_ backup: SystemBackup, revision: SystemBackupRevision, account: String) async throws {
    let id = backup.installation.systemId
    try validateSystemId(id)
    let path = try repositoryPath(backup.installation.repository).lowercased()
    guard !systems.contains(where: { (try? repositoryPath($0.repository).lowercased()) == path }) else {
      throw StoreError.message("A different System from this repository is already installed.")
    }
    let stage = support.appendingPathComponent("SystemRestore-\(UUID().uuidString)")
    defer { try? files.removeItem(at: stage) }
    let package = try SystemPackage(data: backup.package)
    guard package.digest == backup.installation.packageDigest else { throw StoreError.message("Backup package identity does not match.") }
    _ = try await SystemRuntime.inspect(package)
    try createDirectory(stage)
    let stageStorage = stage.appendingPathComponent("storage", isDirectory: true)
    try createDirectory(stageStorage)
    var names = Set<String>()
    for file in backup.files {
      guard !file.name.isEmpty, !file.name.contains("/"), file.name != ".", file.name != "..", names.insert(file.name).inserted else {
        throw StoreError.message("Backup contains an invalid storage file.")
      }
      try file.data.write(to: stageStorage.appendingPathComponent(file.name), options: .atomic)
    }
    try backup.package.write(to: stage.appendingPathComponent("system.zip"), options: .atomic)
    try writeInstallation(backup.installation, to: stage)
    try writeCloudAccount(account, to: stage)
    try JSONEncoder().encode(Optional(revision)).write(to: stage.appendingPathComponent("backup-baseline.json"), options: .atomic)
    let candidate = try await SystemRuntime.open(package: package, storageDirectory: stageStorage,
      systemId: id, requireExistingStorage: true)
    await candidate.dispose()
    try Data().write(to: stage.appendingPathComponent("backup-needed"), options: .atomic)
    try await cloud.requireAccount(account)
    guard try await cloud.revision(systemId: id, account: account) == revision else {
      throw StoreError.message("The iCloud backup changed during restoration. Retry to restore the newer backup.")
    }
    guard !files.fileExists(atPath: directory(id).path) else { throw StoreError.message("This System is already installed.") }
    try files.moveItem(at: stage, to: directory(id))
  }

  private func loadSystems() throws {
    localScanSucceeded = false
    var found: [InstalledSystem] = []
    var repositories = Set<String>()
    var failures: [String] = []
    for url in try files.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) {
      do {
        guard try url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else { continue }
        let installed = try loadInstallation(from: url)
        try validateSystemId(installed.systemId)
        guard url.lastPathComponent == installed.systemId else { throw StoreError.message("Installed System directory does not match its identity.") }
        let path = try repositoryPath(installed.repository).lowercased()
        let package = try loadPackage(from: url, expected: installed.packageDigest)
        guard repositories.insert(path).inserted else { throw StoreError.message("More than one System uses the same repository.") }
        let status = systems.first(where: { $0.id == installed.systemId })?.backupStatus
          ?? (files.fileExists(atPath: pendingMarker(installed.systemId).path) ? "Backup pending" : "Backup status unknown")
        found.append(InstalledSystem(id: installed.systemId, systemName: package.manifest.systemName,
          repository: installed.repository, backupStatus: status))
      } catch { failures.append("\(url.lastPathComponent): \(error.localizedDescription)") }
    }
    systems = found.sorted { $0.systemName.localizedCaseInsensitiveCompare($1.systemName) == .orderedAscending }
    localScanSucceeded = failures.isEmpty
    if !failures.isEmpty {
      error = "Some installed Systems could not be loaded. Their data was not changed. \(failures.joined(separator: "; "))"
    }
  }

  private func validateSystemId(_ id: String) throws {
    guard !id.isEmpty, id.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil else {
      throw StoreError.message("Invalid System ID.")
    }
  }

  private func openRuntime(_ package: SystemPackage, _ installed: SystemInstallation, at directory: URL) async throws {
    let opened = try await SystemRuntime.open(package: package, storageDirectory: directory,
      systemId: installed.systemId, requireExistingStorage: true)
    do {
      guard let data = opened.inspectionJSON.data(using: .utf8),
        let initializationData = opened.initializationJSON.data(using: .utf8) else {
        throw StoreError.message("Invalid System metadata.")
      }
      self.inspection = try JSONDecoder().decode(SystemInspection.self, from: data)
      self.recoveryFailures = try JSONDecoder().decode(SystemInitialization.self, from: initializationData).recoveryFailures
      self.package = package
      self.installation = installed
      self.runtime = opened
    } catch { await opened.dispose(); throw error }
  }

  @discardableResult private func markNeedsCapture(_ id: String) throws -> String {
    let marker = UUID().uuidString
    try Data(marker.utf8).write(to: pendingMarker(id), options: .atomic)
    return marker
  }

  private func capturePendingSystems() async {
    guard cloudUsable, selectedSystemId == nil, runtime == nil else { return }
    for system in systems where files.fileExists(atPath: pendingMarker(system.id).path)
      && !files.fileExists(atPath: conflictMarker(system.id).path) {
      do {
        let installed = try loadInstallation(from: directory(system.id))
        let package = try loadPackage(from: directory(system.id), expected: installed.packageDigest)
        try markNeedsCapture(system.id)
        try await openRuntime(package, installed, at: storage(system.id))
        selectedSystemId = system.id
        try await captureBackup()
      } catch { setBackupStatus(system.id, "Backup pending: \(error.localizedDescription)") }
      await closeRuntime(saveConsole: false)
    }
  }

  /// Capture the runtime's storage while it owns the lease and excludes writes.
  private func captureBackup() async throws {
    guard let current = runtime, let package, var installed = installation, let id = selectedSystemId else { return }
    guard !files.fileExists(atPath: conflictMarker(id).path) else { throw StoreError.message("This System has an iCloud backup conflict.") }
    guard cloudUsable else { setBackupStatus(id, "Backup pending: check iCloud"); return }
    let marker = try markNeedsCapture(id)
    guard installed.backupSequence < Int64.max else { throw StoreError.message("Backup sequence is exhausted.") }
    installed.backupSequence += 1
    try writeInstallation(installed, to: directory(id))
    installation = installed
    let backupFiles = (try await current.captureStorage()).map { SystemBackup.File(name: $0.name, data: $0.data) }
    let backup = SystemBackup(formatVersion: 1, installation: installed, package: package.data, files: backupFiles, capturedAt: Date())
    let pending = try PendingSystemBackup(snapshot: backup)
    let revision = SystemBackupRevision(sequence: installed.backupSequence, digest: pending.digest)
    try JSONEncoder().encode(revision).write(to: pendingRevisionFile(id, sequence: installed.backupSequence), options: .atomic)
    pendingBackups[id] = pending
    pendingBackupMarkers[id] = marker
    setBackupStatus(id, "Backup pending")
    startUpload(id)
  }

  private func startUpload(_ id: String) {
    guard uploadTasks[id] == nil, cloudUsable,
      !files.fileExists(atPath: conflictMarker(id).path),
      files.fileExists(atPath: baselineFile(id).path) else { return }
    uploadTasks[id] = Task { @MainActor in
      defer { uploadTasks[id] = nil }
      while let backup = pendingBackups[id], let marker = pendingBackupMarkers[id] {
        pendingBackups[id] = nil
        pendingBackupMarkers[id] = nil
        do {
          guard let account = try loadCloudAccount(from: directory(id)) else {
            throw StoreError.message("The original iCloud account binding is missing.")
          }
          try await cloud.requireAccount(account)
          var expected = try readBaseline(id)
          let remote = try await cloud.revision(systemId: id, account: account)
          if remote != expected, let remote,
            remote.sequence <= backup.snapshot.installation.backupSequence,
            (expected.map { remote.sequence > $0.sequence } ?? true),
            try isPendingRevision(remote, id: id) {
            // The remote snapshot was saved before its acknowledgement was lost.
            try writeBaseline(remote, id: id)
            try? removeVerifiedRevisions(id, through: remote.sequence)
            expected = remote
          }
          try await cloud.upload(backup, account: account, expectedRevision: expected)
          let revision = SystemBackupRevision(sequence: backup.snapshot.installation.backupSequence, digest: backup.digest)
          guard try await cloud.revision(systemId: id, account: account) == revision else {
            throw StoreError.message("The iCloud backup could not be verified.")
          }
          try writeBaseline(revision, id: id)
          try? removeVerifiedRevisions(id, through: revision.sequence)
          let latest = try loadInstallation(from: directory(id))
          let currentMarker = try? String(contentsOf: pendingMarker(id), encoding: .utf8)
          if pendingBackups[id] == nil && latest.backupSequence == backup.snapshot.installation.backupSequence
            && currentMarker == marker {
            try files.removeItem(at: pendingMarker(id))
            setBackupStatus(id, "Backed up \(backup.snapshot.capturedAt.formatted())")
          }
        } catch {
          if let failure = error as? SystemBackupStore.BackupError, case .newerSnapshot = failure {
            try? quarantine(id)
            hasBackup = true
            let message = "iCloud has a conflicting backup for this System; preserve both copies before resolving it."
            restoreFailures.append(message)
            setBackupStatus(id, message)
            return
          }
          if pendingBackups[id] == nil {
            pendingBackups[id] = backup
            pendingBackupMarkers[id] = marker
            setBackupStatus(id, "Backup pending: \(error.localizedDescription)")
            return
          }
        }
      }
    }
  }

  private func removeVerifiedRevisions(_ id: String, through sequence: Int64) throws {
    for url in try files.contentsOfDirectory(at: directory(id), includingPropertiesForKeys: nil) {
      let name = url.lastPathComponent
      guard name.hasPrefix("backup-revision-"), name.hasSuffix(".json") else { continue }
      let number = name.dropFirst("backup-revision-".count).dropLast(".json".count)
      if let revision = Int64(number), revision <= sequence { try files.removeItem(at: url) }
    }
  }

  private func quarantine(_ id: String) throws {
    try Data().write(to: conflictMarker(id), options: .atomic)
  }

  private func readBaseline(_ id: String) throws -> SystemBackupRevision? {
    try JSONDecoder().decode(SystemBackupRevision?.self, from: Data(contentsOf: baselineFile(id)))
  }

  private func writeBaseline(_ revision: SystemBackupRevision?, id: String) throws {
    try JSONEncoder().encode(revision).write(to: baselineFile(id), options: .atomic)
  }

  private func isPendingRevision(_ revision: SystemBackupRevision, id: String) throws -> Bool {
    let url = pendingRevisionFile(id, sequence: revision.sequence)
    guard files.fileExists(atPath: url.path) else { return false }
    return try JSONDecoder().decode(SystemBackupRevision.self, from: Data(contentsOf: url)) == revision
  }

  private func setBackupStatus(_ id: String, _ status: String) {
    if let index = systems.firstIndex(where: { $0.id == id }) { systems[index].backupStatus = status }
    if selectedSystemId == id { backupStatus = status }
  }

  private func createDirectory(_ url: URL) throws {
    try files.createDirectory(at: url, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
  }

  private func prettyJSON(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed, .prettyPrinted, .sortedKeys])
    guard let text = String(data: data, encoding: .utf8) else { throw StoreError.message("Invalid JSON response.") }
    return text
  }

  private func writeInstallation(_ value: SystemInstallation, to directory: URL) throws {
    try JSONEncoder().encode(value).write(to: directory.appendingPathComponent("installation.json"), options: .atomic)
  }
  private func loadInstallation(from directory: URL) throws -> SystemInstallation {
    try JSONDecoder().decode(SystemInstallation.self, from: Data(contentsOf: directory.appendingPathComponent("installation.json")))
  }

  private func writeCloudAccount(_ account: String, to directory: URL) throws {
    guard !account.isEmpty else { throw StoreError.message("Invalid iCloud account identity.") }
    try JSONEncoder().encode(account).write(to: directory.appendingPathComponent("icloud-account.json"), options: .atomic)
  }

  private func loadCloudAccount(from directory: URL) throws -> String? {
    let url = directory.appendingPathComponent("icloud-account.json")
    guard files.fileExists(atPath: url.path) else { return nil }
    let account = try JSONDecoder().decode(String.self, from: Data(contentsOf: url))
    guard !account.isEmpty else { throw StoreError.message("Stored iCloud account identity is invalid.") }
    return account
  }

  private func loadPackage(from directory: URL, expected: String) throws -> SystemPackage {
    let package = try SystemPackage(data: Data(contentsOf: directory.appendingPathComponent("system.zip")))
    guard package.digest == expected else { throw StoreError.message("Installed System package digest does not match.") }
    return package
  }
  private func repositoryPath(_ value: String) throws -> String {
    let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines))
    guard let url, url.scheme == "https", url.host == "github.com", url.query == nil, url.fragment == nil else {
      throw StoreError.message("Enter a public https://github.com/owner/repository URL.")
    }
    let parts = url.pathComponents.filter { $0 != "/" }
    guard parts.count == 2, parts.allSatisfy({ $0.range(of: "^[A-Za-z0-9_.-]+$", options: .regularExpression) != nil }) else {
      throw StoreError.message("Enter a public GitHub repository URL.")
    }
    return parts.joined(separator: "/")
  }
  private enum StoreError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let message) = self { message } else { nil } }
  }
}
