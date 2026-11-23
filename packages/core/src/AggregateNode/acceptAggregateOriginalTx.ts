import {
  makeNodeCommandInputConflictError,
  makeZerospinError,
} from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { assertSameNodeCommand } from '../Node/assertSameNodeCommand.ts';
import type { INodeRetention } from '../Node/NodeCommandCoverage.ts';
import { sessionKey } from '../Node/sessionKey.ts';

import {
  aggregateNodeTables,
  type IAggregateNodeTables,
} from './aggregateNodeTables.ts';
import { hasAggregateNodeCheckpoint } from './hasAggregateNodeCheckpoint.ts';
import { readAggregateNodeIndexes } from './readAggregateNodeIndexes.ts';
import { readAggregateNodeMetadata } from './readAggregateNodeMetadata.ts';
import { readAggregateNodeCommand } from './readAggregateNodeRecord.ts';
import type {
  IAggregateNodeCommand,
  IAggregateNodeDefinition,
} from './types.ts';

/** Compare exact retries before current admission, then atomically append immutable input. */
export async function acceptAggregateOriginalTx(props: {
  db: SqliteRemoteDatabase;
  nodeTables?: IAggregateNodeTables;
  definition: IAggregateNodeDefinition;
  command: IAggregateNodeCommand;
  blockedWork(): boolean;
  expectedNodeId?: string;
  standalone?: { validate(command: IAggregateNodeCommand): Promise<void> };
}): Promise<INodeRetention> {
  const nodeTables = props.nodeTables ?? aggregateNodeTables;
  const aggregateNodeCommands = nodeTables.commands;
  const { db, definition, blockedWork, expectedNodeId, standalone, command } =
    props;
  const metadata = await readAggregateNodeMetadata(db, nodeTables);
  if (expectedNodeId !== undefined && metadata.nodeId !== expectedNodeId) {
    throw makeZerospinError(
      standalone === undefined
        ? 'outbox-source-replaced'
        : 'standalone-capability-stale',
    );
  }
  const retained = await db
    .select()
    .from(aggregateNodeCommands)
    .where(
      and(
        eq(aggregateNodeCommands.sessionId, command.sessionId),
        eq(aggregateNodeCommands.sessionIndex, command.sessionIndex),
      ),
    )
    .orderBy(aggregateNodeCommands.nodeIndex);
  if (retained.length > 0) {
    const original = retained.find(row => row.pushIndex !== null);
    if (original === undefined) throw makeNodeCommandInputConflictError();
    const retainedCommand = readAggregateNodeCommand(
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
  if (!hasAggregateNodeCheckpoint(metadata) || blockedWork()) {
    throw makeZerospinError({ code: 'node-staging-blocked' });
  }
  await standalone?.validate(command);
  await assertAggregateOriginalBinding(
    command,
    definition,
    standalone !== undefined,
  );
  const indexes = await readAggregateNodeIndexes(db, nodeTables);
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
  await db.insert(aggregateNodeCommands).values({
    sessionId: command.sessionId,
    sessionIndex: command.sessionIndex,
    commandName: command.commandName,
    payload: command.payload,
    claims: command.claims,
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

/** Verify the authored Aggregate, actor, claims, and contract version before retaining an original. */
export async function assertAggregateOriginalBinding(
  command: IAggregateNodeCommand,
  definition: IAggregateNodeDefinition,
  standalone = false,
) {
  const identity = definition.identity;
  if (
    command.aggregateId !== identity.aggregateId ||
    command.aggregateName !== identity.aggregateName ||
    command.aggregateVersion !== identity.aggregateVersion ||
    command.actorName !== identity.actorName ||
    command.actorVersion !== identity.actorVersion ||
    command.sessionName !== identity.sessionName ||
    (!standalone &&
      (await sessionKey({ ...identity, claims: command.claims })) !==
        (await sessionKey(identity)))
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
}
