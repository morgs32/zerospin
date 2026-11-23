import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { DownAdapterRefused } from '@zerospin/core/contracts/DownAdapterRefused';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { materializeCommandTx } from '@zerospin/system-worker/AggregateVersionRepo/materializeCommandTx';
import { readAggregateMaterializationHead } from '@zerospin/system-worker/AggregateVersionRepo/readAggregateMaterializationHead';
import { AggregateChains } from '@zerospin/system-worker/repoServices/AggregateChains';
import { AggregateVersionChains } from '@zerospin/system-worker/repoServices/AggregateVersionChains';
import * as Effect from 'effect/Effect';

import type { replayCommand } from './replayCommands/replayCommand.js';
import { replayCommands } from './replayCommands/replayCommands.js';

/** Initialize through the fixed predecessor prefix before opening the Repo. */
export const initializeAggregatePredecessor = Effect.fn(
  'AggregateVersionRepo.initializeAggregatePredecessor',
)(
  function* <E, R>(props: {
    db: IDb;
    key: Parameters<typeof replayCommand>[0]['key'];
    aggregateRelease: IAnyAggregateRelease;
    execution: Parameters<typeof replayCommand>[0]['execution'];
    prepareReplayPayload: Parameters<
      typeof replayCommand
    >[0]['prepareReplayPayload'];
    publishThrough(index: number): Effect.Effect<void, E, R>;
  }) {
    const {
      db,
      key,
      aggregateRelease,
      execution,
      prepareReplayPayload,
      publishThrough,
    } = props;
    const source = yield* (yield* AggregateChains).getRepo({ key });
    const point = yield* Effect.promise(() =>
      source.prepareAggregatePredecessor({
        aggregateVersion: key.aggregateVersion,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    let afterIndex = readAggregateMaterializationHead(db).aggregateIndex;
    // An interrupted activation can leave a materialized but unpublished prefix.
    const materializedPrefix = Math.min(afterIndex, point.aggregateIndex);
    if (materializedPrefix > 0) {
      yield* publishThrough(materializedPrefix);
    }
    if (afterIndex >= point.aggregateIndex) return;

    yield* Effect.promise(() =>
      source.catchupAggregatePredecessor({
        aggregateVersion: key.aggregateVersion,
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    const history = yield* (yield* AggregateVersionChains).getRepo({
      key: { ...key, aggregateVersion: point.aggregateVersion },
    });
    while (afterIndex < point.aggregateIndex) {
      const { rows } = yield* Effect.promise(() =>
        history.getEvaluatedCommandPage({
          afterIndex,
          maxIndex: point.aggregateIndex,
        }),
      ).pipe(Effect.flatMap(readRpcEnvelope));
      const last = rows.at(-1);
      if (last === undefined) {
        return yield* makeZerospinError(
          'aggregate-predecessor-history-missing',
        );
      }

      if (aggregateRelease.branchFrom !== undefined) {
        for (const command of rows) {
          yield* materializeCommandTx(db, {
            row: command,
            aggregateRelease,
            key,
            mode: 'replay',
            retainedCommand: command,
          });
        }
      } else {
        // Every predecessor history starts at position 1, including inherited commands.
        yield* replayCommands({
          source: 'predecessor',
          rows,
          db,
          key,
          execution,
          prepareReplayPayload,
        });
      }
      yield* publishThrough(last.aggregateIndex);
      afterIndex = last.aggregateIndex;
    }
  },
  Effect.mapError(error =>
    error === DownAdapterRefused
      ? makeZerospinError('aggregate-predecessor-initialization-refused')
      : error,
  ),
);
