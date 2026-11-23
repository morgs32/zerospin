import { Schema } from 'effect';

/**
 * DO SQLite caps bound parameters at 100 — insert one command occurrence per statement.
 *
 * @bad Bulk `insert().values([...])` with many final command occurrences in one statement.
 */
export function insertFinalCommands(props: {
  tx: {
    insert: (table: unknown) => {
      values: (row: unknown) => { run: () => void };
    };
  };
  chainCommandsTable: unknown;
  finalCommands: readonly unknown[];
}) {
  const { chainCommandsTable, finalCommands, tx } = props;

  for (const finalCommand of finalCommands) {
    tx.insert(chainCommandsTable)
      .values(Schema.encodeSync(FinalCommandSchema)(finalCommand))
      .run();
  }
}

declare const FinalCommandSchema: unknown;
