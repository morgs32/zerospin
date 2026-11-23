import { makeZerospinError } from '@zerospin/error';

export type INodeStorageMigration = {
  readonly id: number;
  readonly name: string;
  readonly sql: readonly string[];
};
export type IPreparedNodeMigration = INodeStorageMigration & {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly checksum: string;
};

/** Compile immutable forward history before acquiring a SQL transaction. */
export async function prepareNodeMigrationHistory(props: {
  baselineVersion: number;
  migrations: readonly INodeStorageMigration[];
}): Promise<readonly IPreparedNodeMigration[]> {
  const { baselineVersion, migrations } = props;
  if (
    !Number.isSafeInteger(baselineVersion) ||
    baselineVersion < 1 ||
    baselineVersion + migrations.length > 0x7fffffff
  ) {
    throw makeZerospinError('node-storage-upgrade-history-invalid');
  }
  const history: IPreparedNodeMigration[] = [];
  for (const [index, step] of [
    { id: 0, name: 'baseline', sql: [] },
    ...migrations,
  ].entries()) {
    if (
      !Number.isSafeInteger(step.id) ||
      step.id <= (history.at(-1)?.id ?? -1) ||
      step.name.trim() === ''
    ) {
      throw makeZerospinError('node-storage-upgrade-history-invalid');
    }
    // Keep the released checksum inputs. The SQLite stamp advances once per declared step.
    const migration = {
      ...step,
      fromVersion: baselineVersion + Math.max(0, index - 1),
      toVersion: baselineVersion + index,
    };
    const definition = JSON.stringify([
      migration.id,
      migration.name,
      migration.fromVersion,
      migration.toVersion,
      migration.sql,
    ]);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(definition),
    );
    const checksum = [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    history.push(
      Object.freeze({
        ...migration,
        sql: Object.freeze([...migration.sql]),
        checksum,
      }),
    );
  }
  return Object.freeze(history);
}

/** Stored stamps must represent one complete prefix, never a rewritten history. */
export function validateNodeMigrationHistory(props: {
  history: readonly IPreparedNodeMigration[];
  applied: readonly { migrationId: number; definitionChecksum: string }[];
}): void {
  const { history, applied } = props;
  if (applied.length === 0 || applied.length > history.length) {
    throw makeZerospinError('node-storage-upgrade-history-invalid');
  }
  for (let index = 0; index < applied.length; index += 1) {
    const actual = applied[index];
    const expected = history[index];
    if (
      actual === undefined ||
      expected === undefined ||
      actual.migrationId !== expected.id ||
      actual.definitionChecksum !== expected.checksum
    ) {
      throw makeZerospinError('node-storage-upgrade-history-invalid');
    }
  }
}
