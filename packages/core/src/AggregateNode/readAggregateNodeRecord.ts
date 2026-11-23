import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import type { IAggregateExposedCommand } from '../aggregateSession/types.ts';
import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import type { IAggregateNodeCommandRow } from './AggregateNode.ts';
import { AggregateNodeCommandSchema } from './AggregateNodeCommandSchema.ts';
import type {
  IAggregateNodeCommand,
  IAggregateNodeDefinition,
} from './types.ts';

export function readAggregateNodeCommand(
  row: IAggregateNodeCommandRow,
  nodeId: string,
  definition: IAggregateNodeDefinition,
): Extract<IAggregateNodeCommand, { nodeId: string }> {
  if (
    row.id !== null ||
    row.sessionId === null ||
    row.sessionIndex === null ||
    !Number.isSafeInteger(row.sessionIndex) ||
    row.sessionIndex < 1 ||
    !Number.isSafeInteger(row.nodeIndex) ||
    row.nodeIndex < 1 ||
    row.pushIndex === null ||
    !Number.isSafeInteger(row.pushIndex) ||
    row.pushIndex < 1 ||
    row.payload === null ||
    row.claims === null ||
    row.stagingOutcome === null ||
    row.aggregateIndex !== null ||
    row.dispositionChainHash !== null ||
    row.exposedDelta !== null ||
    row.failure !== null
  ) {
    throw makeZerospinError({ code: 'node-command-input-missing' });
  }
  const contract = definition.lock.contracts[row.commandName];
  if (
    !Object.hasOwn(definition.lock.contracts, row.commandName) ||
    contract === undefined ||
    contract.commandName !== row.commandName
  ) {
    throw makeZerospinError('node-command-contract-mismatch');
  }
  const { identity } = definition;
  return Schema.decodeUnknownSync(AggregateNodeCommandSchema.members[1])({
    id: makeNodeCommandId(nodeId, row.pushIndex),
    sessionId: row.sessionId,
    sessionIndex: row.sessionIndex,
    commandName: row.commandName,
    payload: row.payload,
    contractVersion: contract.version,
    aggregateId: identity.aggregateId,
    aggregateName: identity.aggregateName,
    aggregateVersion: identity.aggregateVersion,
    kind: 'actor',
    actorName: identity.actorName,
    actorVersion: identity.actorVersion,
    claims: row.claims,
    sessionName: identity.sessionName,
    stagingOutcome: row.stagingOutcome,
    nodeId,
    nodeIndex: row.nodeIndex,
    pushIndex: row.pushIndex,
  });
}

export function readAggregateFinalCommand(
  row: IAggregateNodeCommandRow,
  nodeId: string,
): IAggregateExposedCommand & Readonly<{ nodeId: string; nodeIndex: number }> {
  if (
    row.id === null ||
    row.sessionId !== null ||
    row.sessionIndex !== null ||
    !Number.isSafeInteger(row.nodeIndex) ||
    row.nodeIndex < 1 ||
    row.aggregateIndex === null ||
    !Number.isSafeInteger(row.aggregateIndex) ||
    row.aggregateIndex < 1 ||
    row.dispositionChainHash === null ||
    row.exposedDelta === null ||
    row.pushIndex !== null ||
    row.payload !== null ||
    row.claims !== null ||
    row.stagingOutcome !== null
  ) {
    throw makeZerospinError({ code: 'node-command-final-missing' });
  }
  return {
    nodeId,
    nodeIndex: row.nodeIndex,
    id: row.id,
    commandName: row.commandName,
    delta: Schema.decodeUnknownSync(ActorDeltaSchema)(row.exposedDelta),
    failure: Schema.decodeUnknownSync(BrowserCommandSchema.fields.failure)(
      row.failure,
    ),
    aggregateIndex: row.aggregateIndex,
    dispositionChainHash: row.dispositionChainHash,
  };
}
