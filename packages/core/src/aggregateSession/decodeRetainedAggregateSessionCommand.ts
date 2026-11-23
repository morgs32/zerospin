import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { AggregateNodeCommandSchema } from '../AggregateNode/AggregateNodeCommandSchema.ts';
import type { IAggregateNodeIdentity } from '../AggregateNode/types.ts';
import { makeNodeCommandId } from '../contracts/commandIds.ts';
import { StagingOutcomeSchema } from '../contracts/StagingOutcomeSchema.ts';

import { aggregateSessionRepoDbConfig } from './aggregateSessionRepoDbConfig.ts';
import type { IAggregateSessionDefinition, ISessionId } from './types.ts';

/** Reconstruct complete immutable input from the local row and its bound session definition. */
export const decodeRetainedAggregateSessionCommand = Effect.fn(
  'decodeRetainedAggregateSessionCommand',
)(function* (
  row: typeof aggregateSessionRepoDbConfig.schema.commands.$inferSelect,
  binding: {
    definition: IAggregateSessionDefinition;
    identity: IAggregateNodeIdentity;
    sessionId: ISessionId;
  },
) {
  const { definition, identity, sessionId } = binding;
  const command = yield* aggregateSessionRepoDbConfig.tables.commands
    .decodeRow(row)
    .pipe(
      mapParseError({
        code: 'node-command-preparation-failed',
        prefix: 'Invalid retained local command',
      }),
    );
  const contract = definition.contracts[command.commandName];
  if (contract === undefined || contract.commandName !== command.commandName) {
    return yield* makeZerospinError('node-command-contract-mismatch');
  }
  return Schema.decodeUnknownSync(AggregateNodeCommandSchema)(
    {
      id:
        command.nodeId === null || command.pushIndex === null
          ? null
          : makeNodeCommandId(command.nodeId, command.pushIndex),
      nodeId: command.nodeId,
      nodeIndex: command.nodeIndex,
      pushIndex: command.pushIndex,
      commandName: command.commandName,
      payload: command.payload,
      contractVersion: contract.version,
      aggregateId: identity.aggregateId,
      aggregateName: definition.aggregateName,
      aggregateVersion: definition.aggregateVersion,
      kind: 'actor',
      actorName: definition.actorName,
      actorVersion: definition.actorVersion,
      claims: identity.claims,
      sessionName: definition.sessionName,
      sessionId,
      sessionIndex: command.sessionIndex,
      stagingOutcome: Schema.encodeSync(StagingOutcomeSchema)(
        command.stagingOutcome,
      ),
    },
    { onExcessProperty: 'error' },
  );
});
