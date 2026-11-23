import { makeZerospinError } from '@zerospin/error';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { AggregateExposedCommandSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type { IAggregateExposedCommand } from '../aggregateSession/types.ts';
import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IAnyModels } from '../models/types.ts';
import { applyNodeResourceDeltaTx } from '../Node/applyNodeResourceDeltaTx.ts';
import { nodeCommandIdSql } from '../Node/nodeCommandIdSql.ts';

import {
  aggregateNodeTables,
  type IAggregateNodeTables,
} from './aggregateNodeTables.ts';
import { hasAggregateNodeCheckpoint } from './hasAggregateNodeCheckpoint.ts';
import { readAggregateNodeIndexes } from './readAggregateNodeIndexes.ts';
import { readAggregateNodeMetadata } from './readAggregateNodeMetadata.ts';
import { readAggregateFinalCommand } from './readAggregateNodeRecord.ts';

/** Retain one exact final command and advance selected resources and private producer progress atomically. */
export async function retainAggregateFinalTx(props: {
  db: SqliteRemoteDatabase;
  nodeTables?: IAggregateNodeTables;
  models: IAnyModels;
  tables: Record<string, SQLiteTable>;
  command: IAggregateExposedCommand;
  applyDelta?: boolean;
}) {
  const nodeTables = props.nodeTables ?? aggregateNodeTables;
  const aggregateNodeMetadata = nodeTables.metadata;
  const aggregateNodeCommands = nodeTables.commands;
  const {
    db,
    models,
    tables,
    applyDelta = true,
    command: inputCommand,
  } = props;
  const command = Schema.decodeUnknownSync(
    Schema.toType(AggregateExposedCommandSchema),
    { onExcessProperty: 'error' },
  )(inputCommand);
  const metadata = await readAggregateNodeMetadata(db, nodeTables);
  if (
    !hasAggregateNodeCheckpoint(metadata) ||
    !Number.isSafeInteger(command.aggregateIndex) ||
    command.aggregateIndex < 1 ||
    !/^[a-f0-9]{64}$/u.test(command.dispositionChainHash)
  ) {
    throw makeZerospinError({
      code: 'node-execution-checkpoint-invalid',
    });
  }
  const [retainedFinal] = await db
    .select()
    .from(aggregateNodeCommands)
    .where(
      sql`${aggregateNodeCommands.aggregateIndex} = ${command.aggregateIndex} OR (${aggregateNodeCommands.id} = ${command.id} AND ${aggregateNodeCommands.aggregateIndex} IS NOT NULL)`,
    );
  if (retainedFinal !== undefined) {
    const {
      nodeId: _nodeId,
      nodeIndex: _nodeIndex,
      ...retained
    } = readAggregateFinalCommand(retainedFinal, metadata.nodeId);
    if (!isEqual(retained, command)) {
      throw makeZerospinError({ code: 'node-outcome-conflict' });
    }
    return false;
  }
  if (
    command.aggregateIndex > metadata.aggregateIndex + 1 ||
    (command.aggregateIndex === metadata.aggregateIndex &&
      command.dispositionChainHash !== metadata.dispositionChainHash)
  ) {
    throw makeZerospinError({
      code: 'node-execution-gap',
      extra: { expectedAggregateIndex: metadata.aggregateIndex + 1 },
    });
  }
  const [submitted] = await db
    .select()
    .from(aggregateNodeCommands)
    .where(
      and(
        eq(
          nodeCommandIdSql(metadata.nodeId, aggregateNodeCommands),
          command.id,
        ),
        isNotNull(aggregateNodeCommands.pushIndex),
      ),
    );
  if (
    submitted !== undefined &&
    submitted.commandName !== command.commandName
  ) {
    throw makeZerospinError({ code: 'node-outcome-conflict' });
  }
  const indexes = await readAggregateNodeIndexes(db, nodeTables);
  const nodeIndex = indexes.nodeIndex + 1;
  if (
    !Number.isSafeInteger(nodeIndex) ||
    nodeIndex < 1 ||
    nodeIndex >= Number.MAX_SAFE_INTEGER
  ) {
    throw makeZerospinError({ code: 'node-index-invalid' });
  }
  await db.insert(aggregateNodeCommands).values({
    nodeIndex,
    id: command.id,
    commandName: command.commandName,
    aggregateIndex: command.aggregateIndex,
    dispositionChainHash: command.dispositionChainHash,
    exposedDelta: Schema.encodeSync(ActorDeltaSchema)(command.delta),
    failure: Schema.encodeSync(BrowserCommandSchema.fields.failure)(
      command.failure,
    ),
  });
  if (applyDelta && command.aggregateIndex > metadata.aggregateIndex) {
    await applyNodeResourceDeltaTx({
      db,
      tables,
      models,
      delta: command.delta,
    });
  }
  await db.update(aggregateNodeMetadata).set({
    admittedThroughPushIndex: Math.max(
      metadata.admittedThroughPushIndex,
      submitted?.pushIndex ?? 0,
    ),
    ...(command.aggregateIndex > metadata.aggregateIndex
      ? {
          aggregateIndex: command.aggregateIndex,
          dispositionChainHash: command.dispositionChainHash,
        }
      : {}),
  });
  return true;
}
