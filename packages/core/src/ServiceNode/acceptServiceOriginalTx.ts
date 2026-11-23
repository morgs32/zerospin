import {
  makeNodeCommandInputConflictError,
  makeZerospinError,
} from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { assertSameNodeCommand } from '../Node/assertSameNodeCommand.ts';
import type { INodeRetention } from '../Node/NodeCommandCoverage.ts';
import { sessionKey } from '../Node/sessionKey.ts';

import { hasServiceNodeCheckpoint } from './hasServiceNodeCheckpoint.ts';
import { readServiceNodeIndexes } from './readServiceNodeIndexes.ts';
import { readServiceNodeMetadata } from './readServiceNodeMetadata.ts';
import { readServiceNodeCommand } from './readServiceNodeRecord.ts';
import {
  serviceNodeTables,
  type IServiceNodeTables,
} from './serviceNodeTables.ts';
import type { IServiceNodeCommand, IServiceNodeDefinition } from './types.ts';

/** Compare exact retries before current admission, then atomically append immutable input. */
export async function acceptServiceOriginalTx(props: {
  db: SqliteRemoteDatabase;
  nodeTables?: IServiceNodeTables;
  definition: IServiceNodeDefinition;
  command: IServiceNodeCommand;
  blockedWork(): boolean;
  expectedNodeId?: string;
}): Promise<INodeRetention> {
  const nodeTables = props.nodeTables ?? serviceNodeTables;
  const serviceNodeCommands = nodeTables.commands;
  const { db, definition, blockedWork, expectedNodeId, command } = props;
  const metadata = await readServiceNodeMetadata(db, nodeTables);
  if (expectedNodeId !== undefined && metadata.nodeId !== expectedNodeId) {
    throw makeZerospinError('outbox-source-replaced');
  }
  const retained = await db
    .select()
    .from(serviceNodeCommands)
    .where(
      and(
        eq(serviceNodeCommands.sessionId, command.sessionId),
        eq(serviceNodeCommands.sessionIndex, command.sessionIndex),
      ),
    )
    .orderBy(serviceNodeCommands.nodeIndex);
  if (retained.length > 0) {
    const original = retained.find(row => row.pushIndex !== null);
    if (original === undefined) throw makeNodeCommandInputConflictError();
    const retainedCommand = readServiceNodeCommand(
      original,
      metadata.nodeId,
      definition,
    );
    assertSameNodeCommand(retainedCommand, command);
    return {
      sessionId: command.sessionId,
      sessionIndex: command.sessionIndex,
      pushIndex: original.pushIndex!,
      nodeId: metadata.nodeId,
      nodeIndex: original.nodeIndex,
    };
  }
  if (command.nodeId !== null) {
    throw makeZerospinError('session-snapshot-acknowledged-command-missing');
  }
  if (!hasServiceNodeCheckpoint(metadata) || blockedWork()) {
    throw makeZerospinError({ code: 'node-staging-blocked' });
  }
  const identity = definition.identity;
  if (
    command.serviceName !== identity.serviceName ||
    command.actorName !== identity.actorName ||
    command.actorVersion !== identity.actorVersion ||
    command.sessionName !== identity.sessionName ||
    (await sessionKey({ ...identity, claims: command.claims })) !==
      (await sessionKey(identity))
  ) {
    throw makeZerospinError({ code: 'node-command-identity-mismatch' });
  }
  const contract = definition.lock.contracts[command.commandName];
  if (
    !Object.hasOwn(definition.lock.contracts, command.commandName) ||
    contract === undefined ||
    contract.commandName !== command.commandName ||
    contract.version !== command.contractVersion
  ) {
    throw makeZerospinError('node-command-contract-mismatch');
  }
  const indexes = await readServiceNodeIndexes(db, nodeTables);
  const nodeIndex = indexes.nodeIndex + 1;
  const pushIndex = indexes.pushIndex + 1;
  if (
    !Number.isSafeInteger(nodeIndex) ||
    nodeIndex < 1 ||
    nodeIndex >= Number.MAX_SAFE_INTEGER ||
    !Number.isSafeInteger(pushIndex) ||
    pushIndex < 1 ||
    pushIndex >= Number.MAX_SAFE_INTEGER
  ) {
    throw makeZerospinError({ code: 'node-index-invalid' });
  }
  await db.insert(serviceNodeCommands).values({
    sessionId: command.sessionId,
    sessionIndex: command.sessionIndex,
    commandName: command.commandName,
    payload: command.payload,
    stagingOutcome: command.stagingOutcome,
    nodeIndex,
    pushIndex,
  });
  return {
    sessionId: command.sessionId,
    sessionIndex: command.sessionIndex,
    nodeId: metadata.nodeId,
    nodeIndex,
    pushIndex,
  };
}
