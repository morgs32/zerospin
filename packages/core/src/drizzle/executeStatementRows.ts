import type { ICommitObservation } from './makeCommitObservation.ts';
import type { ISqliteClient, ISqliteStatementParameter } from './types.ts';

type IStatementRows<ROW> = { rows: ROW[]; changes: number };

type IStatementExecutionInput = {
  client: ISqliteClient;
  observation: ICommitObservation;
  parameters: readonly unknown[];
  sql: string;
  rowMode: 'arrays' | 'objects';
};

function bindStatementParameter(value: unknown): ISqliteStatementParameter {
  if (value === null || typeof value === 'string' || typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Uint8Array) return value.slice();
  if (
    Array.isArray(value) &&
    value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return new Uint8Array(value);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }
  throw new Error(`Unsupported sqlite parameter value: ${typeof value}`);
}

/** Prepare, bind, collect and finalize through the same statement engine. */
export function executeStatementRows(
  props: IStatementExecutionInput & { rowMode: 'arrays' },
): IStatementRows<unknown[]>;
export function executeStatementRows(
  props: IStatementExecutionInput & { rowMode: 'objects' },
): IStatementRows<Record<string, unknown>>;
export function executeStatementRows(
  props: IStatementExecutionInput,
): IStatementRows<unknown[] | Record<string, unknown>>;
export function executeStatementRows(
  props: IStatementExecutionInput,
): IStatementRows<unknown[] | Record<string, unknown>> {
  const { parameters: inputParameters, client, observation, sql, rowMode } = props;

  const parameters = inputParameters.map(bindStatementParameter);
  const { sqlite3, db } = client;
  const rows: (unknown[] | Record<string, unknown>)[] = [];
  observation.beginExecution();
  try {
    for (const statement of sqlite3.statements(db, sql, { unscoped: true })) {
      try {
        if (parameters.length > 0) sqlite3.bind_collection(statement, parameters);
        const columnNames =
          rowMode === 'objects' ? sqlite3.column_names(statement) : [];
        let stepResult = sqlite3.step(statement);
        while (stepResult === 100) {
          const values = sqlite3.row(statement);
          if (rowMode === 'arrays') {
            rows.push(values);
          } else {
            const row: Record<string, unknown> = {};
            columnNames.forEach((name, index) => {
              row[name] = values[index];
            });
            rows.push(row);
          }
          stepResult = sqlite3.step(statement);
        }
      } finally {
        sqlite3.finalize(statement);
      }
    }
    const changes = sqlite3.changes(db);
    return { rows, changes };
  } finally {
    observation.finishExecution();
  }
}
