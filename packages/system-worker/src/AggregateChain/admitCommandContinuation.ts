import { RetainedSystemAggregateCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { FailedContinuationPayloadSchema } from '@zerospin/core/contracts/ContinuationPayloadSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { and, eq, isNull } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ICommandDelivery } from '../commandOperations/makeCommandDeliveryQueue.js';
import type { CommandContinuationResponseSchema } from '../ownerOperations/ownerOperationSchema.js';

import { appendAggregateCommand } from './admitAggregateCommands/appendAggregateCommand.js';
import { aggregateChainDbConfig } from './aggregateChainDbConfig.js';

/** Commit the ordinary continuation and consume its pending handoff together. */
const admitCommandContinuationTx = makeTx(
  'AggregateChain.admitCommandContinuation',
)(function* (
  tx: ITx<typeof aggregateChainDbConfig>,
  props: {
    delivery: ICommandDelivery;
    continuation: typeof CommandContinuationResponseSchema.Type;
    key: { aggregateId: string; aggregateName: string };
  },
) {
  const { delivery, continuation, key } = props;
  const { commandOperationOutbox } = aggregateChainDbConfig.schema;
  const position = and(
    eq(commandOperationOutbox.aggregateIndex, delivery.sourceIndex),
    eq(commandOperationOutbox.operationIndex, delivery.operationIndex),
  );
  const pending = tx
    .select()
    .from(commandOperationOutbox)
    .where(position)
    .get();
  if (pending === undefined) return;

  if (continuation !== null) {
    const { failure, ...input } = continuation;
    const command = yield* Schema.decodeUnknownEffect(
      Schema.toType(RetainedSystemAggregateCommandSchema),
    )(
      {
        ...input,
        aggregateName: key.aggregateName,
        aggregateId: key.aggregateId,
        aggregateVersion: delivery.command.continuation?.ownerVersion,
        kind: 'system',
      },
      { onExcessProperty: 'error' },
    );
    yield* appendAggregateCommand(tx, command, failure);
  }
  tx.delete(commandOperationOutbox).where(position).run();
});

/** Hold a failed mapper result across a rolled-back child admission. */
export const admitCommandContinuation = Effect.fn(
  'AggregateChain.admitCommandContinuation',
)(function* <E, R>(
  db: IDb<typeof aggregateChainDbConfig>,
  props: {
    delivery: ICommandDelivery;
    continuation: typeof CommandContinuationResponseSchema.Type;
    key: { aggregateId: string; aggregateName: string };
    producerLease: Effect.Effect<unknown, E, R>;
  },
) {
  const { delivery, continuation, producerLease } = props;
  if (
    continuation?.payload === null &&
    delivery.continuationFailure === undefined
  ) {
    const { id: _id, ...failure } = continuation;
    const encoded = yield* Schema.encodeEffect(
      Schema.fromJsonString(FailedContinuationPayloadSchema),
    )(failure);
    const { commandOperationOutbox } = aggregateChainDbConfig.schema;
    db.update(commandOperationOutbox)
      .set({ continuationFailure: encoded })
      .where(
        and(
          eq(commandOperationOutbox.aggregateIndex, delivery.sourceIndex),
          eq(commandOperationOutbox.operationIndex, delivery.operationIndex),
          isNull(commandOperationOutbox.continuationFailure),
        ),
      )
      .run();
  }
  yield* producerLease;
  yield* admitCommandContinuationTx(db, props);
});
