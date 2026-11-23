import CloudKit
import CryptoKit
import Foundation

struct SystemInstallation: Codable {
  let systemId: String
  let repository: String
  let release: String
  let packageDigest: String
  var backupSequence: Int64
}

struct SystemBackup: Codable {
  struct File: Codable {
    let name: String
    let data: Data
  }
  let formatVersion: Int
  let installation: SystemInstallation
  let package: Data
  let files: [File]
  let capturedAt: Date
}

struct PendingSystemBackup {
  let snapshot: SystemBackup
  let data: Data
  let digest: String

  init(snapshot: SystemBackup) throws {
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(snapshot)
    self.snapshot = snapshot
    self.data = data
    digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

struct SystemBackupDiscovery {
  let backups: [SystemBackup]
  let revisions: [String: SystemBackupRevision]
  let failures: [String]
}

struct SystemBackupRevision: Codable, Equatable {
  let sequence: Int64
  let digest: String
}

/// One record publishes one complete snapshot. A failed upload keeps the previous asset.
@MainActor final class SystemBackupStore {
  private lazy var signedContainer = CKContainer.default()
  private var container: CKContainer? {
    guard Bundle.main.object(forInfoDictionaryKey: "ZerospinCloudKitEnabled") as? String == "YES" else {
      return nil
    }
    return signedContainer
  }
  private func validateAccountIdentifier(_ account: String) throws {
    guard !account.isEmpty, account != CKCurrentUserDefaultName else {
      throw BackupError.accountChanged
    }
  }

  private func recordID(for systemId: String, zoneID: CKRecordZone.ID) -> CKRecord.ID {
    CKRecord.ID(recordName: "system-\(systemId)", zoneID: zoneID)
  }

  /// CloudKit's opaque, container-specific identifier; it contains no Apple Account credentials.
  func accountIdentifier() async throws -> String {
    guard let container else { throw BackupError.unavailable }
    guard try await container.accountStatus() == .available else { throw BackupError.noAccount }
    let account = try await container.userRecordID().recordName
    try validateAccountIdentifier(account)
    return account
  }

  func requireAccount(_ expected: String) async throws {
    try validateAccountIdentifier(expected)
    guard try await accountIdentifier() == expected else { throw BackupError.accountChanged }
  }

  /// Discover every complete backup. A bad record is reported without hiding other Systems.
  func downloadAll(account: String) async throws -> SystemBackupDiscovery {
    guard let container else { throw BackupError.unavailable }
    try await requireAccount(account)
    let database = container.privateCloudDatabase
    let zoneID = CKRecordZone.ID(zoneName: "SystemBackups", ownerName: account)
    let catalogID = CKRecord.ID(recordName: "system-backup-catalog", zoneID: zoneID)
    var records: [CKRecord.ID: CKRecord] = [:]
    var failures: [String] = []
    var recordSystemIds: [CKRecord.ID: String] = [:]
    var unavailableSystemIds = Set<String>()
    // Query indexes lag writes. A fixed catalog, published atomically with each
    // first backup in a custom zone, makes all completed backups discoverable.
    let catalog: CKRecord?
    do { catalog = try await database.record(for: catalogID) }
    catch let error as CKError where error.code == .unknownItem || error.code == .zoneNotFound { catalog = nil }
    if let catalog {
      for systemId in try catalogSystemIds(catalog, expectedID: catalogID) {
        let id = recordID(for: systemId, zoneID: zoneID)
        recordSystemIds[id] = systemId
        do {
          let record = try await database.record(for: id)
          guard record.recordID == id else { throw BackupError.invalidSnapshot }
          records[id] = record
        }
        catch let error as CKError where error.code == .permissionFailure { throw error }
        catch {
          unavailableSystemIds.insert(systemId)
          failures.append("\(systemId): \(error.localizedDescription)")
        }
      }
    }
    try await requireAccount(account)
    var selected: [String: (backup: SystemBackup, digest: String)] = [:]
    for record in records.values {
      do {
        let backup = try decode(record)
        let id = backup.installation.systemId
        guard record.recordID == recordID(for: id, zoneID: zoneID) else {
          throw BackupError.invalidSnapshot
        }
        let digest = record["digest"] as? String ?? ""
        selected[id] = (backup, digest)
      } catch {
        if let id = recordSystemIds[record.recordID] ?? (record["systemId"] as? String), !id.isEmpty {
          unavailableSystemIds.insert(id)
        }
        failures.append("\(record.recordID.recordName): \(error.localizedDescription)")
      }
    }
    for id in unavailableSystemIds { selected.removeValue(forKey: id) }
    try await requireAccount(account)
    let revisions = selected.mapValues {
      SystemBackupRevision(sequence: $0.backup.installation.backupSequence, digest: $0.digest)
    }
    return SystemBackupDiscovery(backups: selected.values.map(\.backup), revisions: revisions, failures: failures)
  }

  private func catalogSystemIds(_ catalog: CKRecord, expectedID: CKRecord.ID) throws -> [String] {
    guard catalog.recordID == expectedID,
      let ids = catalog["systemIds"] as? [String],
      ids.allSatisfy({ !$0.isEmpty }), Set(ids).count == ids.count
    else { throw BackupError.invalidSnapshot }
    return ids
  }

  private func decode(_ record: CKRecord) throws -> SystemBackup {
    guard let asset = record["snapshot"] as? CKAsset, let url = asset.fileURL else {
      throw BackupError.invalidSnapshot
    }
    let values = try url.resourceValues(forKeys: [.fileSizeKey])
    guard let length = values.fileSize, length > 0, length <= 256 * 1024 * 1024 else {
      throw BackupError.invalidSnapshot
    }
    let data = try Data(contentsOf: url)
    let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let backup = try PropertyListDecoder().decode(SystemBackup.self, from: data)
    guard backup.formatVersion == 1,
      (record["sequence"] as? NSNumber)?.int64Value == backup.installation.backupSequence,
      record["systemId"] as? String == backup.installation.systemId,
      record["digest"] as? String == digest
    else { throw BackupError.invalidSnapshot }
    return backup
  }

  private func revision(of record: CKRecord, systemId: String, expectedID: CKRecord.ID) throws -> SystemBackupRevision {
    guard record.recordID == expectedID else { throw BackupError.invalidSnapshot }
    let backup = try decode(record)
    guard backup.installation.systemId == systemId, let digest = record["digest"] as? String else {
      throw BackupError.invalidSnapshot
    }
    return SystemBackupRevision(sequence: backup.installation.backupSequence, digest: digest)
  }

  /// Fetch a verified remote baseline for the System.
  func revision(systemId: String, account: String) async throws -> SystemBackupRevision? {
    guard let container else { throw BackupError.unavailable }
    try await requireAccount(account)
    let database = container.privateCloudDatabase
    let zoneID = CKRecordZone.ID(zoneName: "SystemBackups", ownerName: account)
    let catalogID = CKRecord.ID(recordName: "system-backup-catalog", zoneID: zoneID)
    let recordID = recordID(for: systemId, zoneID: zoneID)
    var currentRevision: SystemBackupRevision?
    let catalog: CKRecord?
    do { catalog = try await database.record(for: catalogID) }
    catch let error as CKError where error.code == .unknownItem || error.code == .zoneNotFound { catalog = nil }
    let listed = try catalog.map { try catalogSystemIds($0, expectedID: catalogID).contains(systemId) } ?? false
    let record: CKRecord?
    do {
      record = try await database.record(for: recordID)
    } catch let error as CKError where error.code == .unknownItem || error.code == .zoneNotFound { record = nil }
    guard listed == (record != nil) else { throw BackupError.invalidSnapshot }
    if let record {
      currentRevision = try revision(of: record, systemId: systemId, expectedID: recordID)
    }
    try await requireAccount(account)
    return currentRevision
  }

  func upload(_ pending: PendingSystemBackup, account: String, expectedRevision: SystemBackupRevision?) async throws {
    guard let container else { throw BackupError.unavailable }
    try await requireAccount(account)
    let database = container.privateCloudDatabase
    let zoneID = CKRecordZone.ID(zoneName: "SystemBackups", ownerName: account)
    let catalogID = CKRecord.ID(recordName: "system-backup-catalog", zoneID: zoneID)
    let backup = pending.snapshot
    let recordID = recordID(for: backup.installation.systemId, zoneID: zoneID)
    let zone: CKRecordZone
    do { zone = try await database.recordZone(for: zoneID) }
    catch let error as CKError where error.code == .zoneNotFound {
      zone = try await database.save(CKRecordZone(zoneID: zoneID))
    }
    guard zone.zoneID == zoneID else { throw BackupError.invalidSnapshot }
    guard zone.capabilities.contains(.atomic) else { throw BackupError.atomicZoneUnavailable }
    try await requireAccount(account)
    let catalog: CKRecord
    do { catalog = try await database.record(for: catalogID) }
    catch let error as CKError where error.code == .unknownItem {
      catalog = CKRecord(recordType: "SystemBackupCatalog", recordID: catalogID)
      catalog["systemIds"] = [] as NSArray
    }
    var ids = try catalogSystemIds(catalog, expectedID: catalogID)
    let alreadyPublished = ids.contains(backup.installation.systemId)
    var record: CKRecord
    var currentRevision: SystemBackupRevision?
    do {
      record = try await database.record(for: recordID)
      guard alreadyPublished else { throw BackupError.invalidSnapshot }
      currentRevision = try revision(of: record, systemId: backup.installation.systemId, expectedID: recordID)
    } catch let error as CKError where error.code == .unknownItem {
      guard !alreadyPublished else { throw BackupError.invalidSnapshot }
      record = CKRecord(recordType: "SystemBackup", recordID: recordID)
    }
    let remoteRevision = currentRevision
    let pendingRevision = SystemBackupRevision(sequence: backup.installation.backupSequence, digest: pending.digest)
    // A successful save whose response was lost is safe to retry verbatim.
    if remoteRevision == pendingRevision {
      try await requireAccount(account)
      return
    }
    guard remoteRevision == expectedRevision else { throw BackupError.newerSnapshot }
    if let remoteRevision {
      guard pendingRevision.sequence > remoteRevision.sequence || pendingRevision == remoteRevision else {
        throw BackupError.newerSnapshot
      }
    }
    try await requireAccount(account)
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("zerospin-backup-\(UUID().uuidString)")
    defer { try? FileManager.default.removeItem(at: url) }
    let data = pending.data
    guard data.count <= 256 * 1024 * 1024 else { throw BackupError.tooLarge }
    try data.write(to: url, options: .atomic)
    record["sequence"] = NSNumber(value: backup.installation.backupSequence)
    record["systemId"] = backup.installation.systemId as NSString
    record["digest"] = pending.digest as NSString
    record["snapshot"] = CKAsset(fileURL: url)
    try await requireAccount(account)
    var recordsToSave = [record]
    if !alreadyPublished {
      ids.append(backup.installation.systemId)
      catalog["systemIds"] = ids as NSArray
      recordsToSave.append(catalog)
    }
    let result = try await database.modifyRecords(
      saving: recordsToSave, deleting: [], savePolicy: .ifServerRecordUnchanged, atomically: true)
    guard let saved = result.saveResults[recordID] else { throw BackupError.invalidSnapshot }
    guard try saved.get().recordID == recordID else { throw BackupError.invalidSnapshot }
    if !alreadyPublished {
      guard let savedCatalog = result.saveResults[catalogID] else { throw BackupError.invalidSnapshot }
      guard try savedCatalog.get().recordID == catalogID else { throw BackupError.invalidSnapshot }
    }
    try await requireAccount(account)
  }

  enum BackupError: LocalizedError {
    case invalidSnapshot, newerSnapshot, tooLarge, unavailable, noAccount, accountChanged, atomicZoneUnavailable
    var errorDescription: String? {
      switch self {
      case .invalidSnapshot: "The iCloud System backup is invalid."
      case .newerSnapshot: "A newer iCloud backup already exists. Restore it before backing up this iPhone."
      case .tooLarge: "The System backup is too large."
      case .unavailable: "iCloud is unavailable in this unsigned build."
      case .noAccount: "No iCloud account is available."
      case .accountChanged: "The iCloud account changed. Sign back into the original account to back up this System."
      case .atomicZoneUnavailable: "The iCloud backup zone does not support atomic publication."
      }
    }
  }
}
