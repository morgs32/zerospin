import type { ISqliteClient } from '@zerospin/core/drizzle/types';
import * as Schema from 'effect/Schema';

declare const __zerospinSQLite: (request: Record<string, unknown>) => unknown;

/** Bind the shared SQLite driver to the native host's synchronous C API. */
export function nativeSqliteExists(name: string): boolean {
  return Schema.decodeUnknownSync(Schema.Boolean)(
    __zerospinSQLite({ method: 'exists', name }),
  );
}

export function openNativeSqlite(
  name: string,
  options?: { readOnly?: boolean },
): ISqliteClient {
  const db = Schema.decodeUnknownSync(Schema.Number)(
    __zerospinSQLite({
      method: 'open',
      name,
      readOnly: options?.readOnly ?? false,
    }),
  );
  const call = (
    method: string,
    id: number,
    props: Record<string, unknown> = {},
  ) => __zerospinSQLite({ method, id, ...props });
  const pendingRestoredNames = new Set<string>();
  let isFlushing = false;
  let readTables: Set<string> | undefined;
  const recordReadTables = (tables: readonly string[]) => {
    for (const name of tables) readTables?.add(name);
  };
  const tableResult = Schema.decodeUnknownSync(
    Schema.Struct({ tables: Schema.Array(Schema.String) }),
  );
  const listeners = new Set<(tables: ReadonlySet<string>) => void>();
  return {
    db,
    sqlite3: {
      exec: (id, sql) => {
        const result = tableResult(call('exec', id, { sql }));
        recordReadTables(result.tables);
      },
      statements: (id, sql) => {
        const result = Schema.decodeUnknownSync(
          Schema.Struct({
            id: Schema.Number,
            tables: Schema.Array(Schema.String),
          }),
        )(call('prepare', id, { sql }));
        recordReadTables(result.tables);
        return [result.id];
      },
      bind_collection: (id, parameters) =>
        call('bind', id, {
          parameters: parameters.map(value =>
            value instanceof Uint8Array
              ? { bytes: [...value] }
              : typeof value === 'bigint'
                ? { integer: value.toString() }
                : value,
          ),
        }),
      step: id => {
        const result = Schema.decodeUnknownSync(
          Schema.Struct({
            code: Schema.Number,
            tables: Schema.Array(Schema.String),
          }),
        )(call('step', id));
        recordReadTables(result.tables);
        return result.code;
      },
      row: id =>
        Schema.decodeUnknownSync(Schema.Array(Schema.Unknown))(
          call('row', id),
        ).map(value => {
          const bytes = Schema.decodeUnknownOption(
            Schema.Struct({ bytes: Schema.Array(Schema.Number) }),
          )(value);
          if (bytes._tag === 'Some') return new Uint8Array(bytes.value.bytes);
          const integer = Schema.decodeUnknownOption(
            Schema.Struct({ integer: Schema.String }),
          )(value);
          return integer._tag === 'Some'
            ? BigInt(integer.value.integer)
            : value;
        }),
      column_names: id => [
        ...Schema.decodeUnknownSync(Schema.Array(Schema.String))(
          call('columns', id),
        ),
      ],
      finalize: id =>
        Schema.decodeUnknownSync(Schema.Number)(call('finalize', id)),
      changes: id =>
        Schema.decodeUnknownSync(Schema.Number)(call('changes', id)),
      close: id => call('close', id),
    },
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
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flushTableChanges(restored) {
      for (const name of restored ?? []) pendingRestoredNames.add(name);
      if (isFlushing) return;
      isFlushing = true;
      try {
        while (true) {
          const committedNames = Schema.decodeUnknownSync(
            Schema.NullOr(Schema.Array(Schema.String)),
          )(call('flush', db));
          // The host is still inside a transaction; retain restored names until settlement.
          if (committedNames === null) return;
          const names = new Set([...committedNames, ...pendingRestoredNames]);
          pendingRestoredNames.clear();
          if (names.size === 0) return;
          const previous = readTables;
          readTables = undefined;
          try {
            for (const listener of [...listeners]) {
              if (!listeners.has(listener)) continue;
              try {
                listener(names);
              } catch (cause) {
                console.error('Native SQLite observer failed', cause);
              }
            }
          } finally {
            readTables = previous;
          }
        }
      } finally {
        isFlushing = false;
      }
    },
  };
}
