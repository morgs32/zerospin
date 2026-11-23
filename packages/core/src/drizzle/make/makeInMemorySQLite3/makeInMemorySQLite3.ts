import * as SQLite from '@livestore/wa-sqlite';
import SQLiteESMFactory from '@livestore/wa-sqlite/dist/wa-sqlite.mjs';

import type { ISQLiteModuleFactory } from './waSqliteModuleFactory/waSqliteModuleFactory.ts';

type ISqliteControl = { savepoint: boolean; operation: string; name: string };
const schemaDropActions = new Set<number>([
  SQLite.SQLITE_DROP_INDEX, SQLite.SQLITE_DROP_TABLE, SQLite.SQLITE_DROP_TEMP_INDEX,
  SQLite.SQLITE_DROP_TEMP_TABLE, SQLite.SQLITE_DROP_TEMP_TRIGGER, SQLite.SQLITE_DROP_TEMP_VIEW,
  SQLite.SQLITE_DROP_TRIGGER, SQLite.SQLITE_DROP_VIEW, SQLite.SQLITE_DROP_VTABLE,
]);

/** Only identify control statements; SQLite supplies their operation and decoded name. */
function controlStatement(sql: string) {
  const keyword = () => {
    sql = sql.replace(/^(?:[\s;]|--[^\r\n]*(?:\r?\n|$)|\/\*[\s\S]*?\*\/)*/, '');
    const word = /^[a-z]+/i.exec(sql)?.[0] ?? '';
    sql = sql.slice(word.length);
    return word.toUpperCase();
  };
  let word = keyword();
  const explained = word === 'EXPLAIN';
  if (explained) {
    word = keyword();
    if (word === 'QUERY') {
      keyword(); // PLAN
      word = keyword();
    }
  }
  return {
    control: ['BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(word),
    explained,
  };
}

/**
 * Creates an in-memory SQLite3 instance and opened db using the given ESM module factory (default: browser-compatible).
 * Caller is responsible for calling sqlite3.close(db) when done.
 */
export async function makeInMemorySQLite3(
  moduleFactory: ISQLiteModuleFactory = SQLiteESMFactory,
): Promise<{
  sqlite3: ReturnType<typeof SQLite.Factory>;
  db: ReturnType<ReturnType<typeof SQLite.Factory>['open_v2Sync']>;
  captureReadTables<T>(read: () => T): { result: T; tables: ReadonlySet<string> };
  subscribeToTableChanges(
    listener: (changedTableNames: ReadonlySet<string>) => void,
  ): () => void;
  flushTableChanges(restoredTableNames?: ReadonlySet<string>): void;
}> {
  const module = await moduleFactory();
  const sqlite3 = SQLite.Factory(module);
  const db = sqlite3.open_v2Sync(':memory:');
  sqlite3.exec(db, 'PRAGMA foreign_keys = ON;');
  const pendingTableNames = new Set<string>();
  const committedTableNames = new Set<string>();
  const savepoints: { name: string; tables: Set<string> }[] = [];
  const controls = new Map<number, ISqliteControl>();
  const schemaDropStatements = new Set<number>();
  let preparingControls: ISqliteControl[] | undefined;
  let dropsSchemaObject = false;
  let readTables: Set<string> | undefined;
  const tableChangeListeners = new Set<
    (changedTableNames: ReadonlySet<string>) => void
  >();
  let didCommit = false;
  let isFlushing = false;

  sqlite3.set_authorizer(db, (_context, action, name, detail) => {
    if (schemaDropActions.has(action)) dropsSchemaObject = true;
    if (action === SQLite.SQLITE_READ && name) readTables?.add(name);
    if (action === SQLite.SQLITE_SAVEPOINT || action === SQLite.SQLITE_TRANSACTION) {
      preparingControls?.push({ savepoint: action === SQLite.SQLITE_SAVEPOINT, operation: name ?? '', name: detail ?? '' });
    }
    // Keep DELETE FROM table observable through update_hook by disabling truncation.
    return action === SQLite.SQLITE_DELETE && name && !name.startsWith('sqlite_') && !dropsSchemaObject
      ? SQLite.SQLITE_IGNORE
      : SQLite.SQLITE_OK;
  }, null);

  const settleCommit = () => {
    if (!didCommit || sqlite3.get_autocommit(db) === 0) return;
    for (const name of pendingTableNames) committedTableNames.add(name);
    pendingTableNames.clear();
    savepoints.length = 0;
    didCommit = false;
  };

  const applyControl = (control: ISqliteControl | undefined) => {
    if (control === undefined) return;
    if (!control.savepoint) {
      if (control.operation === 'ROLLBACK') {
        pendingTableNames.clear();
        savepoints.length = 0;
        didCommit = false;
      }
      return;
    }
    if (control.operation === 'BEGIN') {
      savepoints.push({ name: control.name, tables: new Set(pendingTableNames) });
      return;
    }
    const foldName = (name: string) => name.replace(/[A-Z]/g, letter => letter.toLowerCase());
    const index = savepoints.findLastIndex(frame => foldName(frame.name) === foldName(control.name));
    const frame = savepoints[index];
    if (frame === undefined) throw new Error('Missing SQLite savepoint observation');
    if (control.operation === 'ROLLBACK') {
      pendingTableNames.clear();
      for (const name of frame.tables) pendingTableNames.add(name);
      savepoints.splice(index + 1);
    } else if (control.operation === 'RELEASE') {
      savepoints.splice(index);
    }
  };

  const prepareStatements = sqlite3.statements.bind(sqlite3);
  sqlite3.statements = (connection, sql, options) => {
    const previous = preparingControls;
    const previousDrop = dropsSchemaObject;
    const compiledControls: ISqliteControl[] = [];
    preparingControls = compiledControls;
    dropsSchemaObject = false;
    try {
      const statements = prepareStatements(connection, sql, options);
      // The WASM API compiles batches eagerly. Isolate DROP's internal deletes
      // from a later DML DELETE so only the DML truncate optimization is disabled.
      if (statements.length > 1 && dropsSchemaObject) {
        const sources = statements.map(statement => sqlite3.sql(statement));
        for (const statement of statements) sqlite3.finalize(statement);
        const prepared: number[] = [];
        try {
          for (const source of sources) prepared.push(...sqlite3.statements(connection, source, options));
          return prepared;
        } catch (cause) {
          for (const statement of prepared) sqlite3.finalize(statement);
          throw cause;
        }
      }
      for (const statement of statements) {
        if (dropsSchemaObject) schemaDropStatements.add(statement);
        const kind = controlStatement(sqlite3.sql(statement));
        if (!kind.control) continue;
        const control = compiledControls.shift();
        if (control === undefined) throw new Error('Missing SQLite control metadata');
        if (!kind.explained) controls.set(statement, control);
      }
      return statements;
    } finally {
      preparingControls = previous;
      dropsSchemaObject = previousDrop;
    }
  };
  const stepStatement = sqlite3.step.bind(sqlite3);
  sqlite3.step = statement => {
    const previousDrop = dropsSchemaObject;
    dropsSchemaObject = schemaDropStatements.has(statement);
    try {
      const result = stepStatement(statement);
      if (result === SQLite.SQLITE_DONE) applyControl(controls.get(statement));
      settleCommit();
      return result;
    } catch (cause) {
      // An implicit/full transaction rollback may follow a failed step.
      if (sqlite3.get_autocommit(db) !== 0) {
        pendingTableNames.clear();
        savepoints.length = 0;
        didCommit = false;
      }
      throw cause;
    } finally {
      dropsSchemaObject = previousDrop;
    }
  };
  const finalizeStatement = sqlite3.finalize.bind(sqlite3);
  sqlite3.finalize = statement => {
    try {
      return finalizeStatement(statement);
    } finally {
      controls.delete(statement);
      schemaDropStatements.delete(statement);
      settleCommit();
    }
  };

  // 1 — SQLite invokes this callback from inside sqlite3_step. Record only the
  // table name here; preparing or stepping a live query in this callback would
  // reenter the same connection before the write statement has finished.
  sqlite3.update_hook(db, (_updateType, _databaseName, tableName, _rowId) => {
    if (tableName !== null) {
      pendingTableNames.add(tableName);
    }
  });

  // 2 — The commit hook has the same reentrancy restriction. Its only job is
  // to distinguish committed work from table names recorded before rollback.
  sqlite3.commit_hook(db, () => {
    didCommit = true;
    return 0;
  });

  return {
    sqlite3,
    db,
    captureReadTables(read) {
      const previous = readTables;
      const tables = new Set<string>();
      readTables = tables;
      try {
        return { result: read(), tables };
      } finally {
        readTables = previous;
        for (const name of tables) previous?.add(name);
      }
    },
    subscribeToTableChanges(listener) {
      tableChangeListeners.add(listener);

      return () => {
        tableChangeListeners.delete(listener);
      };
    },
    flushTableChanges(restoredTableNames) {
      for (const name of restoredTableNames ?? []) committedTableNames.add(name);
      if (isFlushing || sqlite3.get_autocommit(db) === 0) return;
      settleCommit();
      isFlushing = true;
      const previousReadTables = readTables;
      readTables = undefined;
      try {
        while (committedTableNames.size > 0 && sqlite3.get_autocommit(db) !== 0) {
          const names = new Set(committedTableNames);
          committedTableNames.clear();
          // A listener's write queues the next batch, after every listener sees this one.
          for (const listener of [...tableChangeListeners]) {
            if (!tableChangeListeners.has(listener)) continue;
            try {
              listener(names);
            } catch (cause) {
              console.error('SQLite committed-table observer threw', cause);
            }
          }
        }
      } finally {
        readTables = previousReadTables;
        isFlushing = false;
      }
    },
  };
}
