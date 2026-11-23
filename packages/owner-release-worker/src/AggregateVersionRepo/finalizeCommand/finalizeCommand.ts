import { AggregateChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import type { IAdmittedAggregateCommand } from '@zerospin/system-worker/AggregateChain/types';
import { materializeCommandTx } from '@zerospin/system-worker/AggregateVersionRepo/materializeCommandTx';
import { readAggregateMaterializationHead } from '@zerospin/system-worker/AggregateVersionRepo/readAggregateMaterializationHead';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Semaphore from 'effect/Semaphore';

import { readEvaluatedCommand } from '../readEvaluatedCommand/readEvaluatedCommand.js';
import type { replayCommand } from '../replayCommands/replayCommand.js';
import type { replayCommandsFanoutSubscriber } from '../replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.js';

type IReplaySubscriber = Effect.Success<
  ReturnType<
    typeof replayCommandsFanoutSubscriber<
      Effect.Error<ReturnType<typeof replayCommand>>,
      never
    >
  >
>;

/** Recover committed originals before catch-up; resolve fresh execution under the permit. */
export const finalizeCommand = Effect.fn(
  'AggregateVersionRepo.finalizeCommand',
)(function* (props: {
  db: IDb;
  key: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  };
  command: IAdmittedAggregateCommand;
  execution: Semaphore.Semaphore;
  replayThrough(index: number): ReturnType<IReplaySubscriber['catchup']>;
}) {
  const { db, key, command, execution, replayThrough } = props;
  if (
    command.aggregateName !== key.aggregateName ||
    command.aggregateId !== key.aggregateId
  ) {
    return yield* makeZerospinError('aggregate-command-owner-mismatch');
  }
  if (command.aggregateVersion !== key.aggregateVersion) {
    return yield* makeZerospinError('aggregate-original-version-mismatch');
  }
  if (
    !Number.isSafeInteger(command.aggregateIndex) ||
    command.aggregateIndex < 1
  ) {
    return yield* makeZerospinError('aggregate-execution-gap');
  }
  if (
    command.outcome !== null ||
    (command.payload === null) !== (command.payloadFailure !== undefined) ||
    !Schema.is(Schema.toType(AggregateChainedCommandSchema))({
      ...command,
      dispositionChainHash: null,
    })
  ) {
    return yield* makeZerospinError('aggregate-original-delivery-invalid');
  }
  if (
    command.aggregateIndex <=
    readAggregateMaterializationHead(db).aggregateIndex
  ) {
    return yield* readEvaluatedCommand({
      db,
      key,
      command,
      aggregateIndex: command.aggregateIndex,
    });
  }
  yield* Effect.promise(() => replayThrough(command.aggregateIndex - 1)).pipe(
    Effect.flatMap(readRpcEnvelope),
  );
  const context: Context.Context<unknown> = yield* Effect.context<unknown>();
  const committed = yield* execution.withPermits(1)(
    Effect.gen(function* () {
      if (
        command.aggregateIndex <=
        readAggregateMaterializationHead(db).aggregateIndex
      ) {
        return;
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
      return yield* materializeCommandTx(db, {
        row: command,
        aggregateRelease,
        key,
        mode: 'original',
      }).pipe(Effect.provideContext(context));
    }),
  );
  // Publication can already have deleted the local outbox. Recovery RPC stays outside the permit.
  if (committed === undefined) {
    return yield* readEvaluatedCommand({
      db,
      key,
      command,
      aggregateIndex: command.aggregateIndex,
    });
  }
  return committed;
}, Effect.scoped);
