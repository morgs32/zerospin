import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import {
  ensureZerospinError,
  makeZerospinError,
  mapParseError,
} from '@zerospin/error';
import type { IAdmittedAggregateCommand } from '@zerospin/system-worker/AggregateChain/types';
import type { IAggregateReplayAdapterRequest } from '@zerospin/system-worker/aggregateReplayAdapter/AggregateReplayAdapterRequestSchema';
import { materializeCommandTx } from '@zerospin/system-worker/AggregateVersionRepo/materializeCommandTx';
import { readAggregateMaterializationHead } from '@zerospin/system-worker/AggregateVersionRepo/readAggregateMaterializationHead';
import { findExecutionContract } from '@zerospin/system-worker/AggregateVersionRepo/utils/findExecutionContract';
import {
  PreparedAggregateReplayPayloadSchema,
  type IPreparedAggregateReplayPayload,
} from '@zerospin/system-worker/AggregateVersionRepo/utils/resolveAggregateExecution';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Semaphore from 'effect/Semaphore';

import { findEvaluatedCommand } from '../readEvaluatedCommand/findEvaluatedCommand.js';
import { readEvaluatedCommand } from '../readEvaluatedCommand/readEvaluatedCommand.js';
import { validateCommandIdentity } from '../validateCommandIdentity.js';

type IPrepareReplayPayload = (
  request: IAggregateReplayAdapterRequest,
  signal: AbortSignal,
) => Promise<IPreparedAggregateReplayPayload>;

/** Restore retained release output; only a fresh parallel release evaluates history anew. */
export const replayCommand = Effect.fn('AggregateVersionRepo.replayCommand')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      aggregateId: string;
      aggregateName: string;
      aggregateVersion: number;
    };
    command: IAdmittedAggregateCommand;
    execution: Semaphore.Semaphore;
    source: 'pull' | 'push' | 'predecessor';
    prepareReplayPayload?: IPrepareReplayPayload | undefined;
  }) {
    const { db, key, command, execution, source, prepareReplayPayload } = props;
    if (command.outcome === null) {
      return yield* makeZerospinError('aggregate-replay-command-pending');
    }
    if (source !== 'pull') {
      yield* validateCommandIdentity(undefined, command, key);
    }
    if (
      command.aggregateIndex <=
      readAggregateMaterializationHead(db).aggregateIndex
    ) {
      yield* readEvaluatedCommand({
        db,
        key,
        aggregateIndex: command.aggregateIndex,
        command,
      });
      return;
    }
    const retainedCommand = yield* findEvaluatedCommand({
      db,
      key,
      aggregateIndex: command.aggregateIndex,
      command,
    });
    if (
      retainedCommand === null &&
      command.aggregateVersion === key.aggregateVersion
    ) {
      return yield* makeZerospinError('aggregate-committed-result-missing');
    }
    const system = yield* System;
    const registry = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregateRelease = yield* getByKeyOrThrow({
      record: registry.releases,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    let preparedReplayPayload: IPreparedAggregateReplayPayload | undefined;
    if (
      prepareReplayPayload !== undefined &&
      retainedCommand === null &&
      command.payload !== null
    ) {
      const receivingContract = findExecutionContract(
        aggregateRelease,
        command,
      );
      const needsDownAdapter =
        receivingContract !== undefined &&
        receivingContract.version < command.contractVersion;
      const sourceRelease = registry.releases[command.aggregateVersion];
      const needsSourceProvenance =
        sourceRelease === undefined ||
        (command.kind === 'actor' &&
          sourceRelease.actors[command.actorName]?.version !==
            command.actorVersion);
      if (needsDownAdapter || needsSourceProvenance) {
        preparedReplayPayload = yield* Effect.tryPromise({
          try: signal =>
            prepareReplayPayload(
              {
                systemId: key.systemId,
                aggregateId: key.aggregateId,
                aggregateName: key.aggregateName,
                aggregateIndex: command.aggregateIndex,
                commandId: command.id,
                receivingAggregateVersion: key.aggregateVersion,
              },
              signal,
            ),
          catch: error =>
            ensureZerospinError({
              code: 'aggregate-replay-adapter-failed',
              error,
            }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: '1 second',
            orElse: () =>
              Effect.fail(
                makeZerospinError('aggregate-replay-adapter-timeout'),
              ),
          }),
          Effect.flatMap(reply =>
            Schema.decodeUnknownEffect(PreparedAggregateReplayPayloadSchema)(
              reply,
              { onExcessProperty: 'error' },
            ).pipe(
              mapParseError({
                code: 'aggregate-replay-adapter-output-invalid',
                prefix: 'Invalid Aggregate replay adapter output',
              }),
            ),
          ),
        );
      }
    }
    const context: Context.Context<unknown> = yield* Effect.context<unknown>();
    const committed = yield* execution.withPermits(1)(
      materializeCommandTx(db, {
        row: command,
        aggregateRelease,
        key,
        mode: 'replay',
        retainedCommand,
        preparedReplayPayload,
      }).pipe(Effect.provideContext(context)),
    );
    if (committed === undefined) {
      yield* readEvaluatedCommand({
        db,
        key,
        aggregateIndex: command.aggregateIndex,
        command,
      });
    } else {
      yield* validateCommandIdentity(command, committed, key);
    }
  },
  Effect.scoped,
);
