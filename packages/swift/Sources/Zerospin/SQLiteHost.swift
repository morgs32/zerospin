import Foundation
import SQLite3

/// All access is confined to the JavaScript executor. Each owner opens its own connection.
final class SQLiteHost {
  final class Connection {
    let handle: OpaquePointer
    var tables: Set<String> = []
    var committedTables: Set<String> = []
    var committed = false
    var savepoints: [(name: String, tables: Set<String>)] = []
    var compiling: StatementMetadata?
    init(_ handle: OpaquePointer) { self.handle = handle }
  }
  final class StatementMetadata {
    var readTables: Set<String> = []
    var savepoint: (operation: String, name: String)?
    var dropsSchemaObject = false
  }
  final class Statement {
    let handle: OpaquePointer
    let connection: Connection
    let metadata: StatementMetadata
    init(_ handle: OpaquePointer, connection: Connection, metadata: StatementMetadata) {
      self.handle = handle
      self.connection = connection
      self.metadata = metadata
    }
  }
  private var databases: [Int: Connection] = [:]
  private var statements: [Int: Statement] = [:]
  private var nextID = 1
  let directory: URL
  init(directory: URL) { self.directory = directory }
  private func retainID() -> Int {
    defer { nextID += 1 }
    return nextID
  }
  private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  private func checked(_ code: Int32, _ handle: OpaquePointer? = nil) throws {
    guard code == SQLITE_OK || code == SQLITE_ROW || code == SQLITE_DONE else {
      throw HostError.message(
        handle.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error \(code)")
    }
  }

  private func prepare(
    _ sql: UnsafePointer<CChar>, connection: Connection, tail: inout UnsafePointer<CChar>?
  ) throws -> Statement? {
    let metadata = StatementMetadata()
    let previous = connection.compiling
    connection.compiling = metadata
    defer { connection.compiling = previous }
    var handle: OpaquePointer?
    try checked(sqlite3_prepare_v2(connection.handle, sql, -1, &handle, &tail), connection.handle)
    return handle.map { Statement($0, connection: connection, metadata: metadata) }
  }

  private func step(_ statement: Statement) throws -> Int32 {
    let connection = statement.connection
    let previous = connection.compiling
    connection.compiling = statement.metadata
    defer { connection.compiling = previous }
    let code = sqlite3_step(statement.handle)
    if code == SQLITE_DONE, sqlite3_stmt_isexplain(statement.handle) == 0,
      let action = statement.metadata.savepoint
    {
      applySavepoint(action, connection: connection)
    }
    collectCommittedTables(connection)
    try checked(code, connection.handle)
    return code
  }

  private func applySavepoint(
    _ action: (operation: String, name: String), connection: Connection
  ) {
    if action.operation == "BEGIN" {
      connection.savepoints.append((action.name, connection.tables))
      return
    }
    guard let index = connection.savepoints.lastIndex(where: { saved in
      saved.name.withCString { savedName in
        action.name.withCString { sqlite3_stricmp(savedName, $0) == 0 }
      }
    }) else { return }
    if action.operation == "ROLLBACK" {
      connection.tables = connection.savepoints[index].tables
      connection.savepoints.removeSubrange((index + 1)...)
    } else if action.operation == "RELEASE" {
      connection.savepoints.removeSubrange(index...)
    }
  }

  private func collectCommittedTables(_ connection: Connection) {
    if connection.committed, sqlite3_get_autocommit(connection.handle) != 0 {
      connection.committedTables.formUnion(connection.tables)
      connection.tables.removeAll()
      connection.savepoints.removeAll()
      connection.committed = false
    }
  }

  private func finalize(_ statement: Statement) throws -> Int32 {
    let code = sqlite3_finalize(statement.handle)
    collectCommittedTables(statement.connection)
    try checked(code, statement.connection.handle)
    return code
  }

  /// Capture all durable files while the executor holds the directory lease.
  /// Open SQLite databases are copied with SQLite's backup API, including
  /// committed WAL content, while the executor queue excludes runtime writes.
  func captureStorage() throws -> [SystemStorageFile] {
    guard statements.values.allSatisfy({ sqlite3_stmt_busy($0.handle) == 0 }) else {
      throw HostError.message("Cannot capture System storage while a SQLite cursor is active")
    }
    let directoryPath = directory.standardizedFileURL.path
    var openDatabases: [String: OpaquePointer] = [:]
    for connection in databases.values {
      let handle = connection.handle
      guard sqlite3_get_autocommit(handle) != 0,
        sqlite3_txn_state(handle, nil) == SQLITE_TXN_NONE
      else { throw HostError.message("Cannot capture System storage during a SQLite transaction") }
      guard sqlite3_db_name(handle, 2) == nil else {
        throw HostError.message("Cannot capture System storage with attached SQLite databases")
      }
      guard let filename = sqlite3_db_filename(handle, "main"), filename.pointee != 0 else {
        continue // In-memory connections do not own durable files.
      }
      let url = URL(fileURLWithPath: String(cString: filename)).standardizedFileURL
      guard url.deletingLastPathComponent().path == directoryPath else {
        throw HostError.message("SQLite database is outside the System storage directory")
      }
      openDatabases[url.lastPathComponent] = handle
    }

    let files = FileManager.default
    let entries = try files.contentsOfDirectory(
      at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey])
    let names = Set(entries.map(\.lastPathComponent))
    guard openDatabases.keys.allSatisfy({ names.contains($0) }) else {
      throw HostError.message("An open System database is missing from storage")
    }
    let scratch = files.temporaryDirectory.appendingPathComponent(
      "zerospin-snapshot-\(UUID().uuidString)", isDirectory: true)
    try files.createDirectory(at: scratch, withIntermediateDirectories: true)
    defer { try? files.removeItem(at: scratch) }

    var result: [SystemStorageFile] = []
    for entry in entries.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
      let values = try entry.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
      guard values.isRegularFile == true, values.isSymbolicLink != true else {
        throw HostError.message("System storage contains an unsupported file")
      }
      let name = entry.lastPathComponent
      if ["-wal", "-shm", "-journal"].contains(where: { suffix in
        name.hasSuffix(suffix) && openDatabases[String(name.dropLast(suffix.count))] != nil
      }) { continue }
      let data: Data
      if let source = openDatabases[name] {
        let destination = scratch.appendingPathComponent(name)
        try backupDatabase(source, to: destination)
        data = try Data(contentsOf: destination)
      } else {
        // Closed databases and their sidecars are stable under the directory lease.
        data = try Data(contentsOf: entry)
      }
      result.append(SystemStorageFile(name: name, data: data))
    }
    return result
  }

  private func backupDatabase(_ source: OpaquePointer, to destination: URL) throws {
    var target: OpaquePointer?
    var closed = false
    defer { if !closed, let target { sqlite3_close_v2(target) } }
    try checked(
      sqlite3_open_v2(destination.path, &target, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil),
      target)
    guard let target else { throw HostError.message("Could not open the SQLite snapshot") }
    guard let backup = sqlite3_backup_init(target, "main", source, "main") else {
      throw HostError.message(String(cString: sqlite3_errmsg(target)))
    }
    let step = sqlite3_backup_step(backup, -1)
    let finish = sqlite3_backup_finish(backup)
    guard step == SQLITE_DONE else { throw HostError.message("SQLite snapshot failed (\(step))") }
    try checked(finish, target)
    try checked(sqlite3_wal_checkpoint_v2(target, nil, SQLITE_CHECKPOINT_TRUNCATE, nil, nil), target)
    // A WAL-mode header without sidecars cannot be opened read-only during
    // restore preflight. The snapshot is a closed, self-contained database;
    // the serving runtime keeps its own database in WAL mode.
    try checked(sqlite3_exec(target, "PRAGMA journal_mode=DELETE", nil, nil, nil), target)
    try checked(sqlite3_close(target), target)
    closed = true
  }

  func invoke(_ request: [String: Any]) throws -> Any {
    let method = request["method"] as? String ?? ""
    let id = request["id"] as? Int ?? 0
    let connection = databases[id]
    let statement = statements[id]?.handle
    switch method {
    case "exists":
      let name = request["name"] as? String ?? ""
      guard name.range(of: "^[a-zA-Z0-9_-]+$", options: .regularExpression) != nil else {
        throw HostError.message("Invalid SQLite namespace")
      }
      let path = directory.appendingPathComponent(name).appendingPathExtension("sqlite").path
      return FileManager.default.fileExists(atPath: path)
    case "open":
      let name = request["name"] as? String ?? ""
      let memory = name == ":memory:"
      let readOnly = request["readOnly"] as? Bool ?? false
      guard memory || name.range(of: "^[a-zA-Z0-9_-]+$", options: .regularExpression) != nil else {
        throw HostError.message("Invalid SQLite namespace")
      }
      guard !memory || !readOnly else { throw HostError.message("An in-memory database cannot be opened read-only") }
      if !memory && !readOnly { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
      let path = memory ? ":memory:" : directory.appendingPathComponent(name).appendingPathExtension("sqlite").path
      var handle: OpaquePointer?
      var retained = false
      defer { if !retained, let handle { sqlite3_close(handle) } }
      try checked(
        sqlite3_open_v2(
          path, &handle, (readOnly ? SQLITE_OPEN_READONLY : SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE) | SQLITE_OPEN_FULLMUTEX, nil
        ), handle)
      guard let handle else { throw HostError.message("SQLite did not open") }
      let value = Connection(handle)
      sqlite3_busy_timeout(handle, 5000)
      if !readOnly {
        try checked(
          sqlite3_exec(
            handle, "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON", nil,
            nil, nil), handle)
        #if os(iOS)
          if !memory {
            for suffix in ["", "-wal", "-shm"] {
              let file = path + suffix
              if FileManager.default.fileExists(atPath: file) {
                try FileManager.default.setAttributes(
                  [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                  ofItemAtPath: file)
              }
            }
          }
        #endif
      }
      let pointer = Unmanaged.passUnretained(value).toOpaque()
      try checked(
        sqlite3_set_authorizer(
          handle,
          { pointer, action, first, second, _, _ in
            guard let pointer else { return SQLITE_OK }
            let connection = Unmanaged<Connection>.fromOpaque(pointer).takeUnretainedValue()
            if action == SQLITE_READ, let first {
              connection.compiling?.readTables.insert(String(cString: first))
            } else if action == SQLITE_SAVEPOINT, let first, let second {
              connection.compiling?.savepoint = (String(cString: first), String(cString: second))
            }
            switch action {
            case SQLITE_DROP_INDEX, SQLITE_DROP_TABLE, SQLITE_DROP_TEMP_INDEX,
              SQLITE_DROP_TEMP_TABLE, SQLITE_DROP_TEMP_TRIGGER, SQLITE_DROP_TEMP_VIEW,
              SQLITE_DROP_TRIGGER, SQLITE_DROP_VIEW, SQLITE_DROP_VTABLE:
              connection.compiling?.dropsSchemaObject = true
            default: break
            }
            // Observe whole-table deletes without suppressing SQLite's schema deletions.
            if action == SQLITE_DELETE, let first,
              connection.compiling?.dropsSchemaObject != true,
              !["sqlite_master", "sqlite_schema", "sqlite_temp_master", "sqlite_temp_schema"].contains(
                String(cString: first))
            {
              return SQLITE_IGNORE
            }
            return SQLITE_OK
          }, pointer), handle)
      sqlite3_update_hook(
        handle,
        { pointer, _, _, table, _ in
          if let pointer, let table {
            Unmanaged<Connection>.fromOpaque(pointer).takeUnretainedValue().tables.insert(
              String(cString: table))
          }
        }, pointer)
      sqlite3_commit_hook(
        handle,
        { pointer in
          if let pointer {
            Unmanaged<Connection>.fromOpaque(pointer).takeUnretainedValue().committed = true
          }
          return 0
        }, pointer)
      sqlite3_rollback_hook(
        handle,
        { pointer in
          if let pointer {
            let value = Unmanaged<Connection>.fromOpaque(pointer).takeUnretainedValue()
            value.committed = false
            value.tables.removeAll()
            value.savepoints.removeAll()
          }
        }, pointer)
      let dbID = retainID()
      databases[dbID] = value
      retained = true
      return dbID
    case "prepare":
      guard let connection else { throw HostError.message("Database is closed") }
      let sql = request["sql"] as? String ?? ""
      let prepared = try sql.withCString { buffer in
        var tail: UnsafePointer<CChar>?
        let prepared = try prepare(buffer, connection: connection, tail: &tail)
        if let tail, !String(cString: tail).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        {
          if let prepared { sqlite3_finalize(prepared.handle) }
          throw HostError.message("Prepare accepts exactly one SQL statement")
        }
        return prepared
      }
      guard let prepared else { throw HostError.message("Empty SQL statement") }
      let statementID = retainID()
      statements[statementID] = prepared
      return ["id": statementID, "tables": Array(prepared.metadata.readTables)]
    case "bind":
      guard let statement else { throw HostError.message("Statement is closed") }
      for (offset, value) in (request["parameters"] as? [Any] ?? []).enumerated() {
        let index = Int32(offset + 1)
        let code: Int32
        if value is NSNull {
          code = sqlite3_bind_null(statement, index)
        } else if let value = value as? String {
          code = value.withCString { sqlite3_bind_text(statement, index, $0, -1, transient) }
        } else if let value = value as? NSNumber {
          code =
            ["f", "d"].contains(String(cString: value.objCType))
            ? sqlite3_bind_double(statement, index, value.doubleValue)
            : sqlite3_bind_int64(statement, index, value.int64Value)
        } else if let integer = (value as? [String: Any])?["integer"] as? String,
          let number = Int64(integer)
        {
          code = sqlite3_bind_int64(statement, index, number)
        } else if let bytes = (value as? [String: Any])?["bytes"] as? [UInt8] {
          code = bytes.withUnsafeBytes {
            sqlite3_bind_blob(statement, index, $0.baseAddress, Int32($0.count), transient)
          }
        } else {
          throw HostError.message("Unsupported SQLite binding")
        }
        try checked(code)
      }
      return NSNull()
    case "step":
      guard let statement = statements[id] else { throw HostError.message("Statement is closed") }
      let code = try step(statement)
      return ["code": Int(code), "tables": Array(statement.metadata.readTables)]
    case "row":
      guard let statement else { throw HostError.message("Statement is closed") }
      return (0..<sqlite3_column_count(statement)).map { index -> Any in
        switch sqlite3_column_type(statement, index) {
        case SQLITE_INTEGER:
          let integer = sqlite3_column_int64(statement, index)
          return integer > 9_007_199_254_740_991 || integer < -9_007_199_254_740_991
            ? ["integer": String(integer)] : integer
        case SQLITE_FLOAT: return sqlite3_column_double(statement, index)
        case SQLITE_TEXT: return String(cString: sqlite3_column_text(statement, index))
        case SQLITE_BLOB:
          let size = Int(sqlite3_column_bytes(statement, index))
          guard let pointer = sqlite3_column_blob(statement, index) else {
            return ["bytes": [UInt8]()]
          }
          return ["bytes": Array(UnsafeRawBufferPointer(start: pointer, count: size))]
        default: return NSNull()
        }
      }
    case "columns":
      guard let statement else { throw HostError.message("Statement is closed") }
      return (0..<sqlite3_column_count(statement)).map {
        String(cString: sqlite3_column_name(statement, $0))
      }
    case "finalize":
      guard let statement = statements.removeValue(forKey: id) else { return 0 }
      let code = try finalize(statement)
      return Int(code)
    case "exec":
      guard let connection else { throw HostError.message("Database is closed") }
      var tables: Set<String> = []
      try (request["sql"] as? String ?? "").withCString { buffer in
        var remaining: UnsafePointer<CChar>? = buffer
        while let sql = remaining, sql.pointee != 0 {
          var tail: UnsafePointer<CChar>?
          let prepared = try prepare(sql, connection: connection, tail: &tail)
          remaining = tail
          guard let prepared else { continue }
          defer { _ = try? finalize(prepared) }
          while try step(prepared) == SQLITE_ROW {}
          tables.formUnion(prepared.metadata.readTables)
        }
      }
      return ["tables": Array(tables)]
    case "changes": return Int(connection.map { sqlite3_changes($0.handle) } ?? 0)
    case "flush":
      guard let connection else { return [String]() }
      guard sqlite3_get_autocommit(connection.handle) != 0 else { return NSNull() }
      let tables = Array(connection.committedTables)
      connection.committedTables.removeAll()
      return tables
    case "close":
      guard let connection = databases[id] else { return NSNull() }
      try checked(sqlite3_close(connection.handle))
      databases.removeValue(forKey: id)
      return NSNull()
    default: throw HostError.message("Unknown SQLite operation \(method)")
    }
  }
  func close() {
    for statement in statements.values { sqlite3_finalize(statement.handle) }
    statements.removeAll()
    for database in databases.values { sqlite3_close(database.handle) }
    databases.removeAll()
  }
}

enum HostError: Error, LocalizedError {
  case message(String)
  var errorDescription: String? {
    switch self {
    case .message(let message): message
    }
  }
}
