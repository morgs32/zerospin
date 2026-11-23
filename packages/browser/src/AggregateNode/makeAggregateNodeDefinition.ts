import type { IAggregateNodeDefinition } from '@zerospin/core/AggregateNode/types';
import { hashNodeValue } from '@zerospin/core/Node/sessionKey';
import { makeZerospinError } from '@zerospin/error';

import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
export async function makeAggregateNodeDefinition(
  request: IAggregateNodeRequest,
  claims: Readonly<Record<string, unknown>>,
  aggregateId: string,
): Promise<IAggregateNodeDefinition> {
  const { lock, ...configuration } = request;
  if (claims.aggregateId !== aggregateId) {
    throw makeZerospinError('session-aggregate-selection-mismatch');
  }
  if (lock.sessionName !== request.sessionName) {
    throw makeZerospinError({ code: 'node-definition-session-mismatch' });
  }
  if (lock.origin.kind !== 'actor') {
    throw new Error('Application node requires an actor declaration');
  }
  return {
    identity: {
      ...configuration,
      aggregateId,
      actorName: lock.origin.actorName,
      actorVersion: lock.origin.actorVersion,
      claims,
      definitionHash: await hashNodeValue(lock),
    },
    lock,
  };
}
