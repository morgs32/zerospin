import { useSyncExternalStore } from 'react';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
} from '../../../../types.js';
import { useLiveQueryOnDb } from '../../../../useLiveQueryOnDb';
import { useAggregateSession, useServiceSession } from '../useSession';

import { sessionsDatabaseTabStyles } from './sessionsDatabaseTabStyles';

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function DatabaseRowsTable(props: {
  readonly rows: readonly Readonly<Record<string, unknown>>[];
  readonly modelAttributes: Readonly<Record<string, unknown>> | undefined;
  readonly modelKey: string;
  readonly error: Error | undefined;
  readonly isLoading: boolean;
}) {
  const { rows, modelAttributes, modelKey, error, isLoading } = props;

  if (error !== undefined) {
    return (
      <p style={sessionsDatabaseTabStyles.errorText}>
        Failed to load rows: {error.message}
      </p>
    );
  }

  if (isLoading && rows.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading rows…</p>;
  }

  if (modelAttributes === undefined) {
    return (
      <p style={{ margin: 0, fontSize: '0.85rem' }}>
        Unknown model key: {modelKey}
      </p>
    );
  }

  const keys = new Set<string>();
  if (rows.length > 0) {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
  } else {
    for (const key of Object.keys(modelAttributes)) {
      keys.add(key);
    }
  }
  const rest = [...keys].filter(key => key !== 'id').sort();
  const columns = keys.has('id') ? ['id', ...rest] : rest;

  return (
    <table style={sessionsDatabaseTabStyles.table}>
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col} style={sessionsDatabaseTabStyles.tableTh}>
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr key={String(row.id ?? rowIdx)}>
            {columns.map(col => {
              const value = row[col];
              return (
                <td key={col} style={sessionsDatabaseTabStyles.tableTd}>
                  {value === null || value === undefined
                    ? ''
                    : typeof value === 'object'
                      ? JSON.stringify(value)
                      : String(value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AggregateDatabaseRowsTable(props: {
  readonly session: IDevtoolsAggregateSessionEntry;
  readonly modelKey: string;
}) {
  const { session, modelKey } = props;
  const db = session.getCommandDb();
  if (db === null) throw new Error('Aggregate session is not initialized');
  const { data, error, updatedAt } = useLiveQueryOnDb({
    db,
    deps: [modelKey],
    query: () => session.getModelQuery(modelKey),
  });
  const rows = Array.isArray(data) ? data.filter(isRecord) : [];

  return (
    <DatabaseRowsTable
      rows={rows}
      modelAttributes={session.getModelAttributes(modelKey)}
      modelKey={modelKey}
      error={error}
      isLoading={updatedAt === undefined}
    />
  );
}

function ServiceDatabaseRowsTable(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly modelKey: string;
}) {
  const { session, modelKey } = props;
  const initialized = useSyncExternalStore(
    session.subscribe,
    session.getInitialized,
    session.getInitialized,
  );
  const serviceIndex = useSyncExternalStore(
    session.subscribe,
    session.getServiceIndex,
    session.getServiceIndex,
  );

  if (initialized === null) {
    return <p style={{ margin: 0, fontSize: '0.85rem' }}>Loading rows…</p>;
  }

  let rows: readonly Readonly<Record<string, unknown>>[] = [];
  let error: Error | undefined;

  try {
    // The subscribed definition index makes each committed service command rerun
    // the typed query closure retained by the registration adapter.
    void serviceIndex;
    const result = session.readModelRows(modelKey);
    rows = Array.isArray(result) ? result.filter(isRecord) : [];
  } catch (cause) {
    error = cause instanceof Error ? cause : new Error(String(cause));
  }

  return (
    <DatabaseRowsTable
      rows={rows}
      modelAttributes={session.getModelAttributes(modelKey)}
      modelKey={modelKey}
      error={error}
      isLoading={false}
    />
  );
}

export function SessionsDatabaseModelRowsTable(props: {
  readonly modelKey: string;
}) {
  const { modelKey } = props;
  const aggregateSession = useAggregateSession();
  const serviceSession = useServiceSession();

  if (aggregateSession !== undefined) {
    return (
      <AggregateDatabaseRowsTable
        session={aggregateSession}
        modelKey={modelKey}
      />
    );
  }

  if (serviceSession !== undefined) {
    return (
      <ServiceDatabaseRowsTable session={serviceSession} modelKey={modelKey} />
    );
  }

  return null;
}
