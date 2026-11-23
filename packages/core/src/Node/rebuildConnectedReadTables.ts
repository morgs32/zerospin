import { isZerospinError, makeZerospinError } from '@zerospin/error';
import { eq, sql } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  type SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Schema from 'effect/Schema';

import {
  compileSqliteTableDefinition,
  quoteSqliteIdentifier,
  type ISqliteTableDefinition,
} from '../drizzle/definition/compileSqliteTableDefinition.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import { ResourceEnvelopeJsonCodec } from '../models/ResourceEnvelopeJsonCodec.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';
import { projectModelSpec } from '../system/project/projectModelSpec.ts';

import { applyNodeResourceDeltaTx } from './applyNodeResourceDeltaTx.ts';
import { makeEncodedRowFromResource } from './resourceEnvelope.ts';
import { validateNodeStorageSchema } from './validateNodeStorageSchema.ts';

// Bump when the confirmed-resource decoder or delta materializer changes meaning with identical DDL.
const materializationRevision = 1;
const readBaseline = sqliteTable('nodeReadTableBaseline', {
  slot: integer().primaryKey(),
  nodeId: text().notNull(),
  position: integer().notNull(),
  dispositionChainHash: text().notNull(),
  resolvedThrough: integer().notNull(),
  declarations: text().notNull(),
  resources: text().notNull(),
});
export const readBaselineResolvedThrough = sql`coalesce((select resolvedThrough from nodeReadTableBaseline where slot = 1), 0)`;
const baselineDefinition = compileSqliteTableDefinition(readBaseline);
const resourceList = Schema.fromJsonString(
  Schema.Array(ResourceEnvelopeJsonCodec),
);
const durableNames = new Set([
  'nodemetadata',
  'commands',
  'applied_migrations',
  'aggregate_command_migrations_48_0_0',
  baselineDefinition.name.toLowerCase(),
]);

export type IConnectedReadBaseline = Readonly<{
  position: number;
  dispositionChainHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;

export function connectedReadDeclarations(
  tables: readonly ISqliteTableDefinition[],
  models: IAnyModels,
) {
  if (tables.some(table => durableNames.has(table.name.toLowerCase()))) {
    throw makeZerospinError('node-storage-upgrade-schema-mismatch');
  }
  return Object.fromEntries(
    tables.map(table => [
      table.name,
      JSON.stringify([
        materializationRevision,
        projectModelSpec(models[table.name]!).propertiesShape,
        table.createTable,
        table.indexes.map(index => index.sql).sort(),
      ]),
    ]),
  );
}

function requireReadSnapshot(nodeId: string) {
  return makeZerospinError({
    code: 'node-read-tables-snapshot-required',
    message:
      'Reconnect to rebuild this view from its authenticated snapshot. Your stored commands are preserved.',
    extra: { nodeId },
  });
}

/** A cached row that the new table rejects may already have been corrected on the Chain. */
function incompatibleReadRow(error: unknown) {
  if (isZerospinError(error) && error.code.startsWith('node-resource-')) {
    return true;
  }
  // Drizzle wraps the SQLite error; extended SQLite result codes retain the primary code in the low byte.
  const cause =
    error instanceof Error && error.cause !== undefined ? error.cause : error;
  return (
    cause instanceof Error &&
    'code' in cause &&
    typeof cause.code === 'number' &&
    (cause.code & 0xff) === 19
  );
}

/** The confirmed snapshot and its replay starting point commit with the Node checkpoint. */
export async function retainConnectedReadBaselineTx(
  db: SqliteRemoteDatabase,
  nodeId: string,
  declarations: Record<string, string>,
  baseline: IConnectedReadBaseline,
): Promise<void> {
  const value = {
    nodeId,
    position: baseline.position,
    dispositionChainHash: baseline.dispositionChainHash,
    resolvedThrough: baseline.resolvedThrough,
    resources: Schema.encodeSync(resourceList)(baseline.resources),
    declarations: JSON.stringify(declarations),
  };
  await db
    .insert(readBaseline)
    .values({ slot: 1, ...value })
    .onConflictDoUpdate({ target: readBaseline.slot, set: value });
}

/** Open the derived cache only after proving the exact producer, binding and command format. */
export async function rebuildConnectedReadTablesTx(props: {
  db: SqliteRemoteDatabase;
  models: IAnyModels;
  tables: Record<string, SQLiteTable>;
  definitions: readonly ISqliteTableDefinition[];
  nodeId: string;
  positionColumn: 'aggregateIndex' | 'serviceIndex';
  position: number | null;
  dispositionChainHash: string | null;
  fresh?: IConnectedReadBaseline | undefined;
  readOriginalProgress(): Promise<{ pushIndex: number; outcomeIndex: number }>;
  readResources(): Promise<readonly IEncodedResourceShape[]>;
}): Promise<{
  position: number | null;
  dispositionChainHash: string | null;
  resolvedThrough: number;
}> {
  const {
    db,
    nodeId,
    definitions,
    tables,
    models,
    position,
    dispositionChainHash,
    fresh,
    positionColumn,
    readOriginalProgress,
    readResources,
  } = props;
  const declarations = connectedReadDeclarations(definitions, models);
  const [exists] = await db.values(
    sql`SELECT 1 FROM sqlite_master WHERE type='table' AND name=${baselineDefinition.name}`,
  );
  if (exists === undefined) {
    await db.run(sql.raw(baselineDefinition.createTable));
  } else {
    try {
      await validateNodeStorageSchema(db, [baselineDefinition], {
        allowOtherTables: true,
      });
    } catch (failure) {
      if (
        !isZerospinError(failure) ||
        failure.code !== 'node-storage-upgrade-schema-mismatch'
      ) {
        throw failure;
      }
      if (fresh === undefined) throw requireReadSnapshot(nodeId);
      // The owning Node has verified its durable binding. Only its derived checkpoint is replaceable here.
      await db.run(
        sql.raw(`DROP TABLE ${quoteSqliteIdentifier(baselineDefinition.name)}`),
      );
      await db.run(sql.raw(baselineDefinition.createTable));
    }
  }
  const [stored] = await db
    .select({
      nodeId: readBaseline.nodeId,
      position: readBaseline.position,
      hash: readBaseline.dispositionChainHash,
      resolvedThrough: readBaseline.resolvedThrough,
      declarations: readBaseline.declarations,
    })
    .from(readBaseline)
    .where(eq(readBaseline.slot, 1));
  if (stored !== undefined && stored.nodeId !== nodeId) {
    throw makeZerospinError('node-storage-identity-mismatch');
  }
  let validBaseline =
    stored !== undefined &&
    position !== null &&
    Number.isSafeInteger(stored.position) &&
    stored.position >= 0 &&
    stored.position <= position &&
    /^[a-f0-9]{64}$/u.test(stored.hash) &&
    (stored.position !== position || stored.hash === dispositionChainHash) &&
    Number.isSafeInteger(stored.resolvedThrough) &&
    stored.resolvedThrough >= 0 &&
    stored.resolvedThrough <= stored.position;
  if (validBaseline && stored !== undefined && stored.resolvedThrough > 0) {
    validBaseline =
      stored.resolvedThrough <= (await readOriginalProgress()).pushIndex;
  }
  if (stored !== undefined && !validBaseline && fresh === undefined) {
    throw requireReadSnapshot(nodeId);
  }
  const installed =
    stored === undefined
      ? undefined
      : Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
        )(stored.declarations);
  // With no marker a physically current table may already contain an original whose final reply was lost.
  // Position zero proves that no original is reflected. A fully finalized prefix also has no ambiguous overlay.
  let unknownCoverage = false;
  if (stored === undefined && position !== null && position > 0) {
    const { pushIndex, outcomeIndex } = await readOriginalProgress();
    unknownCoverage = pushIndex !== outcomeIndex;
  }
  if (unknownCoverage && fresh === undefined) throw requireReadSnapshot(nodeId);
  const dirty = new Set<string>();
  for (const table of definitions) {
    if (
      unknownCoverage ||
      (stored !== undefined &&
        (!validBaseline ||
          installed?._tag !== 'Some' ||
          installed.value[table.name] !== declarations[table.name])) ||
      // Both pre-marker releases used revision one. Later decoders cannot use those rows as a baseline.
      (stored === undefined &&
        position !== null &&
        materializationRevision !== 1)
    ) {
      dirty.add(table.name);
      continue;
    }
    try {
      await validateNodeStorageSchema(db, [table], { allowOtherTables: true });
    } catch (error) {
      if (
        !isZerospinError(error) ||
        error.code !== 'node-storage-upgrade-schema-mismatch'
      ) {
        throw error;
      }
      dirty.add(table.name);
    }
  }
  const unchanged = {
    position,
    dispositionChainHash,
    resolvedThrough: stored?.resolvedThrough ?? 0,
  };
  if (dirty.size === 0 && !unknownCoverage && fresh === undefined) {
    if (
      stored === undefined &&
      position !== null &&
      dispositionChainHash !== null
    ) {
      // Bootstrap an exact pre-cache schema. Its rows are complete confirmed envelopes.
      await retainConnectedReadBaselineTx(db, nodeId, declarations, {
        position,
        dispositionChainHash,
        resolvedThrough: 0,
        resources: await readResources().catch(error => {
          if (
            isZerospinError(error) &&
            error.code.startsWith('node-resource-')
          ) {
            throw requireReadSnapshot(nodeId);
          }
          throw error;
        }),
      });
    }
    return unchanged;
  }

  let source: IConnectedReadBaseline | undefined;
  if (fresh !== undefined) {
    const { pushIndex, outcomeIndex } = await readOriginalProgress();
    if (
      !Number.isSafeInteger(fresh.position) ||
      fresh.position < (position ?? 0) ||
      (position === fresh.position &&
        dispositionChainHash !== fresh.dispositionChainHash) ||
      !/^[a-f0-9]{64}$/u.test(fresh.dispositionChainHash) ||
      !Number.isSafeInteger(fresh.resolvedThrough) ||
      fresh.resolvedThrough < outcomeIndex ||
      fresh.resolvedThrough > fresh.position ||
      fresh.resolvedThrough > pushIndex
    ) {
      throw requireReadSnapshot(nodeId);
    }
    source = fresh;
    // A newer authoritative checkpoint covers every model, including tables with unchanged DDL.
    if (position !== fresh.position || stored === undefined) {
      for (const table of definitions) dirty.add(table.name);
    }
  } else if (
    stored !== undefined &&
    position !== null &&
    stored.position <= position
  ) {
    const [row] = await db
      .select({ resources: readBaseline.resources })
      .from(readBaseline)
      .where(eq(readBaseline.slot, 1));
    const decoded = Schema.decodeUnknownOption(resourceList)(row?.resources);
    if (decoded._tag !== 'Some') throw requireReadSnapshot(nodeId);
    source = {
      position: stored.position,
      dispositionChainHash: stored.hash,
      resolvedThrough: stored.resolvedThrough,
      resources: decoded.value,
    };
  } else if (position !== null) {
    throw requireReadSnapshot(nodeId);
  }

  // Dropping a parent can cascade into otherwise reusable tables. Rebuild those rows too.
  for (const parent of dirty) {
    for (const table of definitions) {
      if (
        table.foreignKeys.some(
          key =>
            key.tableName === parent &&
            ['cascade', 'set null', 'set default'].includes(
              key.onDelete.toLowerCase(),
            ),
        )
      ) {
        dirty.add(table.name);
      }
    }
  }
  await db.run(sql`PRAGMA defer_foreign_keys = ON`);
  const rebuild = definitions.filter(table => dirty.has(table.name));
  // SQLite index names are database-wide. Release every old name before recreating any index.
  for (const table of rebuild) {
    await db.run(
      sql.raw(`DROP TABLE IF EXISTS ${quoteSqliteIdentifier(table.name)}`),
    );
  }
  for (const table of rebuild) {
    await db.run(sql.raw(table.createTable));
    for (const index of table.indexes) await db.run(sql.raw(index.sql));
  }
  if (source === undefined) return unchanged;
  const inserted = new Set<string>();
  for (const resource of source.resources.filter(item =>
    dirty.has(item.modelName),
  )) {
    const key = JSON.stringify([resource.modelName, resource.id]);
    if (inserted.has(key)) throw requireReadSnapshot(nodeId);
    inserted.add(key);
    const model = models[resource.modelName]!;
    try {
      const row = makeEncodedRowFromResource(resource, model);
      await db.insert(tables[resource.modelName]!).values(row);
    } catch (error) {
      if (fresh === undefined && incompatibleReadRow(error)) {
        throw requireReadSnapshot(nodeId);
      }
      throw error;
    }
  }
  if (fresh !== undefined) {
    await retainConnectedReadBaselineTx(db, nodeId, declarations, fresh);
    return fresh;
  }

  // Every newer confirmed position must be represented by a retained final following this snapshot.
  const column = sql.raw(quoteSqliteIdentifier(positionColumn));
  const finals = await db.all<{
    position: number;
    hash: string;
    delta: string;
  }>(
    sql`SELECT ${column} AS position, dispositionChainHash AS hash, exposedDelta AS delta
        FROM commands WHERE ${column} > ${source.position} AND ${column} <= ${position} ORDER BY ${column}`,
  );
  let last = source.position;
  let hash = source.dispositionChainHash;
  for (const final of finals) {
    if (final.position !== last + 1) throw requireReadSnapshot(nodeId);
    const delta = Schema.decodeUnknownOption(
      Schema.fromJsonString(ActorDeltaSchema),
    )(final.delta);
    if (delta._tag !== 'Some') throw requireReadSnapshot(nodeId);
    await applyNodeResourceDeltaTx({
      db,
      tables,
      models,
      delta: {
        upserted: delta.value.upserted.filter(resource =>
          dirty.has(resource.modelName),
        ),
        deleted: delta.value.deleted.filter(ref => dirty.has(ref.modelName)),
      },
    }).catch(error => {
      if (incompatibleReadRow(error)) throw requireReadSnapshot(nodeId);
      throw error;
    });
    last = final.position;
    hash = final.hash;
  }
  if (last !== position || hash !== dispositionChainHash) {
    throw requireReadSnapshot(nodeId);
  }
  for (const table of definitions) {
    if (dirty.has(table.name) && table.foreignKeys.length > 0) {
      const violations = await db.values(
        sql.raw(
          `PRAGMA foreign_key_check(${quoteSqliteIdentifier(table.name)})`,
        ),
      );
      if (violations.length > 0) throw requireReadSnapshot(nodeId);
    }
  }
  await db
    .update(readBaseline)
    .set({ declarations: JSON.stringify(declarations) })
    .where(eq(readBaseline.slot, 1));
  return unchanged;
}
