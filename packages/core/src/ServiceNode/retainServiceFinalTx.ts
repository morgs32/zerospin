import { makeZerospinError } from '@zerospin/error';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IAnyModels } from '../models/types.ts';
import { applyNodeResourceDeltaTx } from '../Node/applyNodeResourceDeltaTx.ts';
import { nodeCommandIdSql } from '../Node/nodeCommandIdSql.ts';
import { ServiceExposedCommandSchema } from '../serviceSession/ServiceSessionWireSchema.ts';
import type { IServiceExposedCommand } from '../serviceSession/types.ts';

import { hasServiceNodeCheckpoint } from './hasServiceNodeCheckpoint.ts';
import { readServiceNodeIndexes } from './readServiceNodeIndexes.ts';
import { readServiceNodeMetadata } from './readServiceNodeMetadata.ts';
import { readServiceFinalCommand } from './readServiceNodeRecord.ts';
import {
  serviceNodeTables,
  type IServiceNodeTables,
} from './serviceNodeTables.ts';

/** Retain one exact final command and advance selected resources and private producer progress atomically. */
export async function retainServiceFinalTx(props: {
  db: SqliteRemoteDatabase;
  nodeTables?: IServiceNodeTables;
  models: IAnyModels;
  tables: Record<string, SQLiteTable>;
  command: IServiceExposedCommand;
  applyDelta?: boolean;
}) {
  const nodeTables = props.nodeTables ?? serviceNodeTables;
  const serviceNodeMetadata = nodeTables.metadata;
  const serviceNodeCommands = nodeTables.commands;
  const {
    db,
    models,
    tables,
    applyDelta = true,
    command: inputCommand,
  } = props;
  const command = Schema.decodeUnknownSync(
    Schema.toType(ServiceExposedCommandSchema),
    { onExcessProperty: 'error' },
  )(inputCommand);
  const metadata = await readServiceNodeMetadata(db, nodeTables);
  if (
    !hasServiceNodeCheckpoint(metadata) ||
    !Number.isSafeInteger(command.serviceIndex) ||
    command.serviceIndex < 1 ||
    !/^[a-f0-9]{64}$/u.test(command.dispositionChainHash)
  ) {
    throw makeZerospinError({
      code: 'node-execution-checkpoint-invalid',
    });
  }
  const [retainedFinal] = await db
    .select()
    .from(serviceNodeCommands)
    .where(
      sql`${serviceNodeCommands.serviceIndex} = ${command.serviceIndex} OR (${serviceNodeCommands.id} = ${command.id} AND ${serviceNodeCommands.serviceIndex} IS NOT NULL)`,
    );
  if (retainedFinal !== undefined) {
    const {
      nodeId: _nodeId,
      nodeIndex: _nodeIndex,
      ...retained
    } = readServiceFinalCommand(retainedFinal, metadata.nodeId);
    if (!isEqual(retained, command)) {
      throw makeZerospinError({ code: 'node-outcome-conflict' });
    }
    return false;
  }
  if (
    command.serviceIndex > metadata.serviceIndex + 1 ||
    (command.serviceIndex === metadata.serviceIndex &&
      command.dispositionChainHash !== metadata.dispositionChainHash)
  ) {
    throw makeZerospinError({
      code: 'node-execution-gap',
      extra: { expectedServiceIndex: metadata.serviceIndex + 1 },
    });
  }
  const [submitted] = await db
    .select()
    .from(serviceNodeCommands)
    .where(
      and(
        eq(nodeCommandIdSql(metadata.nodeId, serviceNodeCommands), command.id),
        isNotNull(serviceNodeCommands.pushIndex),
      ),
    );
  if (
    submitted !== undefined &&
    submitted.commandName !== command.commandName
  ) {
    throw makeZerospinError({ code: 'node-outcome-conflict' });
  }
  const indexes = await readServiceNodeIndexes(db, nodeTables);
  const nodeIndex = indexes.nodeIndex + 1;
  if (
    !Number.isSafeInteger(nodeIndex) ||
    nodeIndex < 1 ||
    nodeIndex >= Number.MAX_SAFE_INTEGER
  ) {
    throw makeZerospinError({ code: 'node-index-invalid' });
  }
  await db.insert(serviceNodeCommands).values({
    nodeIndex,
    id: command.id,
    commandName: command.commandName,
    serviceIndex: command.serviceIndex,
    dispositionChainHash: command.dispositionChainHash,
    exposedDelta: Schema.encodeSync(ActorDeltaSchema)(command.delta),
    failure: Schema.encodeSync(BrowserCommandSchema.fields.failure)(
      command.failure,
    ),
  });
  if (applyDelta && command.serviceIndex > metadata.serviceIndex) {
    await applyNodeResourceDeltaTx({
      db,
      tables,
      models,
      delta: command.delta,
    });
  }
  await db.update(serviceNodeMetadata).set({
    admittedThroughPushIndex: Math.max(
      metadata.admittedThroughPushIndex,
      submitted?.pushIndex ?? 0,
    ),
    ...(command.serviceIndex > metadata.serviceIndex
      ? {
          serviceIndex: command.serviceIndex,
          dispositionChainHash: command.dispositionChainHash,
        }
      : {}),
  });
  return true;
}
