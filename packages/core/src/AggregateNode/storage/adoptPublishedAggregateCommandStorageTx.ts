import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import {
  compileSqliteTableDefinition,
  type ISqliteTableDefinition,
} from '../../drizzle/definition/compileSqliteTableDefinition.ts';
import { assertSameNodeCommand } from '../../Node/assertSameNodeCommand.ts';
import { hasNodeCommandFinal } from '../../Node/hasNodeCommandFinal.ts';
import {
  nodeMigrationLedger,
  nodeMigrationLedgerDefinition,
} from '../../Node/nodeMigrationLedger.ts';
import { validateNodeStorageSchema } from '../../Node/validateNodeStorageSchema.ts';
import { assertAggregateOriginalBinding } from '../acceptAggregateOriginalTx.ts';
import type { IAggregateNodeTables } from '../aggregateNodeTables.ts';
import { readAggregateNodeMetadata } from '../readAggregateNodeMetadata.ts';
import { readAggregateNodeCommand } from '../readAggregateNodeRecord.ts';
import type {
  IAggregateNodeCommand,
  IAggregateNodeDefinition,
} from '../types.ts';

import {
  aggregateNodeCommands,
  publishedAggregateNodeTables,
} from './publishedAggregateNodeTables.ts';

const dependencies = compileSqliteTableDefinition(
  sqliteTable(
    'commandDependencies',
    {
      sessionId: text().notNull(),
      sessionIndex: integer().notNull(),
      predecessorIndex: integer().notNull(),
    },
    table => [primaryKey({ columns: [table.sessionId, table.sessionIndex] })],
  ),
);
const uploads = compileSqliteTableDefinition(
  sqliteTable(
    'uploadRequirements',
    {
      sessionId: text().notNull(),
      sessionIndex: integer().notNull(),
      operations: text().notNull(),
    },
    table => [primaryKey({ columns: [table.sessionId, table.sessionIndex] })],
  ),
);

// Exact checksums and framework tables from @zerospin/core 48.0.0 and 48.0.1.
const publishedHistory = [
  {
    version: 22,
    checksum:
      '51a57d8408880e50d285f89e1eb93e31e1df719f927ab77396dc58d2d5c2d47c',
    retired: [],
  },
  {
    version: 23,
    checksum:
      'fdee28023eb42cb45a9b5e332ad26cbdc9dca60aec45867c8101972855e1ad04',
    retired: [dependencies, uploads],
  },
  {
    version: 24,
    checksum:
      '8109a3116175acf6c76789ea483a05d415d125bcdd7fc2d5157b47756220e76f',
    retired: [dependencies],
  },
];
const publishedBaseline24 =
  'b209a06439eb1b4c89aba5c0bce4096dd822eff9e2bc97bd4baac74c76dbda96';

export type IAggregateJournalOriginal = Extract<
  IAggregateNodeCommand,
  { nodeId: null }
> & {
  dependsOn?: Pick<IAggregateNodeCommand, 'sessionId' | 'sessionIndex'>;
};
export type ICheckAggregateJournal = (
  nodeId: string,
  checkOriginal: (entry: IAggregateJournalOriginal) => Promise<void>,
) => Promise<void>;

/** Prove the shipped wait-for-terminal rule using the exact producer's retained original and final. */
export async function checkPublishedJournalOriginal(
  db: SqliteRemoteDatabase,
  tables: IAggregateNodeTables,
  definition: IAggregateNodeDefinition,
  nodeId: string,
  { dependsOn, ...command }: IAggregateJournalOriginal,
  checkStoredDependency = false,
) {
  await assertAggregateOriginalBinding(command, definition);
  const { commands } = tables;
  const [original] = await db
    .select()
    .from(commands)
    .where(
      and(
        eq(commands.sessionId, command.sessionId),
        eq(commands.sessionIndex, command.sessionIndex),
        isNotNull(commands.pushIndex),
      ),
    );
  if (original !== undefined) {
    try {
      assertSameNodeCommand(
        readAggregateNodeCommand(original, nodeId, definition),
        command,
      );
    } catch (error) {
      throw makeZerospinError({
        code: 'node-storage-upgrade-journal-invalid',
        cause: prettyUnknownFailure(error),
      });
    }
    if (checkStoredDependency) {
      const stored = await db.get<{
        predecessorIndex: number;
      }>(sql`SELECT predecessorIndex FROM commandDependencies
        WHERE sessionId = ${command.sessionId} AND sessionIndex = ${command.sessionIndex}`);
      if (stored?.predecessorIndex !== dependsOn?.sessionIndex) {
        throw makeZerospinError('node-storage-upgrade-journal-invalid');
      }
    }
  }
  if (!original) {
    // A journal-only original cannot be appended ahead of an already allocated later submission.
    const [later] = await db
      .select({ nodeIndex: commands.nodeIndex })
      .from(commands)
      .where(
        and(
          eq(commands.sessionId, command.sessionId),
          gt(commands.sessionIndex, command.sessionIndex),
          isNotNull(commands.pushIndex),
        ),
      )
      .limit(1);
    if (later !== undefined) {
      throw makeZerospinError('node-storage-upgrade-journal-invalid');
    }
  }
  if (dependsOn === undefined) return;
  if (
    dependsOn.sessionId !== command.sessionId ||
    dependsOn.sessionIndex >= command.sessionIndex
  ) {
    throw makeZerospinError('node-storage-upgrade-journal-invalid');
  }
  const [predecessor] = await db
    .select({ pushIndex: commands.pushIndex })
    .from(commands)
    .where(
      and(
        eq(commands.sessionId, dependsOn.sessionId),
        eq(commands.sessionIndex, dependsOn.sessionIndex),
        isNotNull(commands.pushIndex),
        hasNodeCommandFinal({
          nodeId,
          journal: commands,
          finalIndex: commands.aggregateIndex,
        }),
      ),
    );
  if (
    !predecessor?.pushIndex ||
    (original?.pushIndex != null && predecessor.pushIndex >= original.pushIndex)
  ) {
    throw makeZerospinError({
      code: 'node-storage-upgrade-predecessor-pending',
      message:
        'A saved tab command is waiting for its predecessor’s outcome. Open the previous compatible release to finish it.',
      extra: dependsOn,
    });
  }
}

/** The browser owns this journal outside SQLite. Check its exact producer under the Node lease. */
export async function checkPublishedAggregateJournal(
  db: SqliteRemoteDatabase,
  sessionKey: string,
  definition: IAggregateNodeDefinition,
  checkJournal: ICheckAggregateJournal,
) {
  const exists = await db.get(
    sql`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'applied_migrations'`,
  );
  if (!exists) return undefined;
  const applied = await db
    .select()
    .from(nodeMigrationLedger)
    .orderBy(nodeMigrationLedger.migrationId);
  if (applied[0]?.definitionChecksum !== publishedHistory[0]!.checksum) {
    return undefined;
  }
  const metadata = await readAggregateNodeMetadata(
    db,
    publishedAggregateNodeTables,
  );
  if (
    metadata.sessionKey !== sessionKey ||
    metadata.aggregateId !== definition.identity.aggregateId
  ) {
    throw makeZerospinError('node-storage-identity-mismatch');
  }
  const hasStoredDependencies =
    publishedHistory[applied.length - 1]?.retired.includes(dependencies) ===
    true;
  await checkJournal(metadata.nodeId, entry =>
    checkPublishedJournalOriginal(
      db,
      publishedAggregateNodeTables,
      definition,
      metadata.nodeId,
      entry,
      hasStoredDependencies,
    ),
  );
  return metadata.nodeId;
}

/** Convert a released Aggregate command schema under the Node's open transaction. */
export async function adoptPublishedAggregateCommandStorageTx(
  db: SqliteRemoteDatabase,
  props: {
    resources: readonly ISqliteTableDefinition[];
    checkedJournalNodeId: string | undefined;
  },
): Promise<void> {
  const objects = await db.all<{
    name: string;
  }>(sql`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name IN ('applied_migrations', 'commandDependencies', 'uploadRequirements')`);
  const names = new Set(objects.map(table => table.name));
  if (!names.has(nodeMigrationLedgerDefinition.name)) return;
  const applied = await db
    .select()
    .from(nodeMigrationLedger)
    .orderBy(nodeMigrationLedger.migrationId);
  const isHistorical =
    applied[0]?.definitionChecksum === publishedHistory[0]!.checksum;
  const source = isHistorical
    ? publishedHistory[applied.length - 1]
    : undefined;
  for (const table of [uploads, dependencies]) {
    if (!names.has(table.name) || source?.retired.includes(table)) continue;
    const resource = props.resources.find(
      resource => resource.name === table.name,
    );
    if (!resource) {
      throw makeZerospinError('node-storage-upgrade-schema-mismatch');
    }
    // A model with this name is allowed. Ambiguous leftover command metadata is not disposable.
    await validateNodeStorageSchema(db, [resource], { allowOtherTables: true });
  }
  if (!isHistorical) return;
  const [stamp] = await db.values<[number]>(sql`PRAGMA user_version`);
  if (
    source === undefined ||
    stamp?.[0] !== source.version ||
    !applied.every(
      (row, index) =>
        row.migrationId === index &&
        row.definitionChecksum === publishedHistory[index]?.checksum,
    )
  ) {
    throw makeZerospinError('node-storage-upgrade-history-invalid');
  }
  await validateNodeStorageSchema(
    db,
    [
      compileSqliteTableDefinition(publishedAggregateNodeTables.metadata),
      compileSqliteTableDefinition(publishedAggregateNodeTables.commands),
      nodeMigrationLedgerDefinition,
      ...source.retired,
    ],
    { allowOtherTables: true },
  );
  const metadata = await readAggregateNodeMetadata(
    db,
    publishedAggregateNodeTables,
  );
  const finalized = hasNodeCommandFinal({
    nodeId: metadata.nodeId,
    journal: aggregateNodeCommands,
    finalIndex: aggregateNodeCommands.aggregateIndex,
  });
  if (source.retired.includes(uploads)) {
    const pending = await db.get(sql`SELECT 1 FROM uploadRequirements AS u
      WHERE NOT EXISTS (SELECT 1 FROM commands WHERE sessionId = u.sessionId AND sessionIndex = u.sessionIndex
        AND pushIndex IS NOT NULL AND ${finalized}) LIMIT 1`);
    if (pending !== undefined) {
      throw makeZerospinError({
        code: 'node-storage-upgrade-upload-pending',
        message:
          'A saved command still requires the earlier upload runtime. Its original and upload requirements have been preserved.',
      });
    }
  }
  if (source.retired.includes(dependencies)) {
    // A predecessor's retained success or failure closes the original wait.
    const blocked = await db.get<{
      sessionId: string;
      sessionIndex: number;
      predecessorIndex: number;
    }>(sql`SELECT d.sessionId, d.sessionIndex, d.predecessorIndex FROM commandDependencies AS d
      WHERE d.predecessorIndex >= d.sessionIndex OR NOT EXISTS (
        SELECT 1 FROM commands AS dependent JOIN commands ON commands.sessionId = dependent.sessionId
        WHERE dependent.sessionId = d.sessionId AND dependent.sessionIndex = d.sessionIndex
          AND commands.sessionIndex = d.predecessorIndex AND commands.pushIndex < dependent.pushIndex
          AND ${finalized}
      ) LIMIT 1`);
    if (blocked !== undefined) {
      throw makeZerospinError({
        code: 'node-storage-upgrade-predecessor-pending',
        message:
          'A saved command is waiting for its predecessor’s outcome. Open the previous compatible release to finish it. Its original and ordering have been preserved.',
        extra: blocked,
      });
    }
  }
  if (metadata.nodeId !== props.checkedJournalNodeId) {
    throw makeZerospinError({
      code: 'node-storage-upgrade-journal-unavailable',
      message:
        'The previous release’s tab journal must be checked before upgrading this producer.',
    });
  }
  for (const table of source.retired) {
    await db.run(sql`DROP TABLE ${sql.identifier(table.name)}`);
  }
  // The old and new 24 share the same command rows and producer metadata. This
  // explicit convergence changes only the proven-consumed auxiliary tables and their stamps.
  // Both published histories start at migration zero. Keep the old ledger and its exact IDs intact.
  await db.run(
    sql`ALTER TABLE applied_migrations RENAME TO aggregate_command_migrations_48_0_0`,
  );
  await db.run(sql.raw(nodeMigrationLedgerDefinition.createTable));
  await db
    .insert(nodeMigrationLedger)
    .values({ migrationId: 0, definitionChecksum: publishedBaseline24 });
  await db.run(sql`PRAGMA user_version = 24`);
}
