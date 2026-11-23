import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IServiceExposedCommand } from '../serviceSession/types.ts';

import type { IServiceNodeCommandRow } from './ServiceNode.ts';
import { ServiceNodeCommandSchema } from './ServiceNodeCommandSchema.ts';
import type { IServiceNodeCommand, IServiceNodeDefinition } from './types.ts';

export function readServiceNodeCommand(
  row: IServiceNodeCommandRow,
  nodeId: string,
  definition: IServiceNodeDefinition,
): Extract<IServiceNodeCommand, { nodeId: string }> {
  if (
    !Number.isSafeInteger(row.nodeIndex) ||
    row.nodeIndex < 1 ||
    row.id !== null ||
    row.sessionId === null ||
    row.sessionIndex === null ||
    !Number.isSafeInteger(row.sessionIndex) ||
    row.sessionIndex < 1 ||
    row.pushIndex === null ||
    !Number.isSafeInteger(row.pushIndex) ||
    row.pushIndex < 1 ||
    row.payload === null ||
    row.stagingOutcome === null ||
    row.serviceIndex !== null ||
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
  return Schema.decodeUnknownSync(ServiceNodeCommandSchema.members[1])({
    id: makeNodeCommandId(nodeId, row.pushIndex),
    sessionId: row.sessionId,
    sessionIndex: row.sessionIndex,
    commandName: row.commandName,
    payload: row.payload,
    contractVersion: contract.version,
    serviceName: identity.serviceName,
    kind: 'actor',
    actorName: identity.actorName,
    actorVersion: identity.actorVersion,
    sessionName: identity.sessionName,
    claims: identity.claims,
    stagingOutcome: row.stagingOutcome,
    nodeId,
    nodeIndex: row.nodeIndex,
    pushIndex: row.pushIndex,
  });
}

export function readServiceFinalCommand(
  row: IServiceNodeCommandRow,
  nodeId: string,
): IServiceExposedCommand & Readonly<{ nodeId: string; nodeIndex: number }> {
  if (
    row.id === null ||
    row.sessionId !== null ||
    row.sessionIndex !== null ||
    !Number.isSafeInteger(row.nodeIndex) ||
    row.nodeIndex < 1 ||
    row.serviceIndex === null ||
    !Number.isSafeInteger(row.serviceIndex) ||
    row.serviceIndex < 1 ||
    row.dispositionChainHash === null ||
    row.exposedDelta === null ||
    row.pushIndex !== null ||
    row.payload !== null ||
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
    serviceIndex: row.serviceIndex,
    dispositionChainHash: row.dispositionChainHash,
  };
}
