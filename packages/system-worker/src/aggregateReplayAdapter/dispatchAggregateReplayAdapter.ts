import type { ISystemSpec } from '@zerospin/core/system/types';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAdmittedAggregateCommand } from '../AggregateChain/types.js';
import { PreparedAggregateReplayPayloadSchema } from '../AggregateVersionRepo/utils/resolveAggregateExecution.js';

import {
  AggregateReplayAdapterRequestSchema,
  type IAggregateReplayAdapterRequest,
} from './AggregateReplayAdapterRequestSchema.js';
import type { IAggregateReplaySourceRequest } from './prepareAggregateReplaySource.js';

export type ICallAggregateReplaySourceAdapter = (
  request: IAggregateReplaySourceRequest,
  signal: AbortSignal,
) => Promise<unknown>;

/** Resolve both the replay input and its source release from the Chain's finalized history. */
export const dispatchAggregateReplayAdapter = Effect.fn(
  'AggregateChain.dispatchAggregateReplayAdapter',
)(function* (props: {
  request: IAggregateReplayAdapterRequest;
  key: { systemId: string; aggregateName: string; aggregateId: string };
  system: ISystemSpec;
  readFinalizedCommand: (
    aggregateIndex: number,
  ) => Effect.Effect<
    IAdmittedAggregateCommand | null,
    IZerospinError | IZerospinErrorJson
  >;
  callSourceAdapter: ICallAggregateReplaySourceAdapter | undefined;
}) {
  const { key, system, readFinalizedCommand, callSourceAdapter } = props;
  const request = yield* Schema.decodeUnknownEffect(
    AggregateReplayAdapterRequestSchema,
  )(props.request, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-replay-adapter-request-invalid',
      prefix: 'Invalid Aggregate replay adapter request',
    }),
  );
  if (
    request.systemId !== key.systemId ||
    request.aggregateName !== key.aggregateName ||
    request.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-identity-mismatch');
  }
  const command = yield* readFinalizedCommand(request.aggregateIndex);
  if (command === null || command.outcome === null) {
    return yield* makeZerospinError(
      'aggregate-replay-finalized-command-unavailable',
    );
  }
  if (command.payload === null) {
    return yield* makeZerospinError('aggregate-replay-adapter-payload-missing');
  }
  const registry = system.aggregates[command.aggregateName];
  const receivingRelease =
    registry?.releases[request.receivingAggregateVersion];
  if (
    receivingRelease === undefined ||
    request.receivingAggregateVersion === command.aggregateVersion
  ) {
    return yield* makeZerospinError('aggregate-replay-adapter-binding-invalid');
  }
  const {
    aggregateIndex,
    outcome,
    payloadFailure: _payloadFailure,
    ...sourceCommand
  } = command;
  if (
    aggregateIndex !== request.aggregateIndex ||
    command.id !== request.commandId ||
    command.aggregateName !== key.aggregateName ||
    command.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-identity-mismatch');
  }
  const actorVersion =
    command.kind === 'actor'
      ? receivingRelease.actors[command.actorName]
      : undefined;
  const receivingContractVersion =
    command.kind === 'actor'
      ? registry?.actorVersions[command.actorName]?.[actorVersion ?? 0]
          ?.contracts[command.commandName]
      : receivingRelease.contracts[command.commandName];
  const receivingContract =
    receivingContractVersion === undefined
      ? undefined
      : registry?.contractVersions[command.commandName]?.[
          receivingContractVersion
        ];
  if (callSourceAdapter === undefined) {
    return yield* makeZerospinError(
      'aggregate-replay-adapter-source-unavailable',
    );
  }

  const sourceRequest: IAggregateReplaySourceRequest = {
    command: sourceCommand,
    receivingContractVersion:
      receivingContract?.external === undefined
        ? (receivingContract?.version ?? null)
        : null,
    finalizedAt: outcome.finalizedAt,
  };
  // The caller's deadline does not cancel Durable Object RPC. Bound the source
  // call independently so a delayed source cannot hold this invocation open.
  const response = yield* Effect.tryPromise({
    try: signal => callSourceAdapter(sourceRequest, signal),
    catch: error =>
      ensureZerospinError({
        code: 'aggregate-replay-adapter-source-failed',
        error,
      }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: '3 seconds',
      orElse: () =>
        Effect.fail(
          makeZerospinError('aggregate-replay-adapter-source-timeout'),
        ),
    }),
  );
  return yield* Schema.decodeUnknownEffect(
    PreparedAggregateReplayPayloadSchema,
  )(response, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'aggregate-replay-adapter-output-invalid',
      prefix: 'Invalid Aggregate replay adapter output',
    }),
  );
});
