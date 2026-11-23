import { RetainedSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { FailedContinuationPayloadSchema } from '@zerospin/core/contracts/ContinuationPayloadSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { and, eq, isNull } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { ICommandDelivery } from '../commandOperations/makeCommandDeliveryQueue.js';
import type { CommandContinuationResponseSchema } from '../ownerOperations/ownerOperationSchema.js';

import { appendServiceCommand } from './admitServiceCommands/appendServiceCommand.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';

/** Commit the ordinary continuation and consume its pending handoff together. */
const admitCommandContinuationTx = makeTx(
  'ServiceChain.admitCommandContinuation',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  props: {
    delivery: ICommandDelivery;
    continuation: typeof CommandContinuationResponseSchema.Type;
    key: { serviceName: string };
  },
) {
  const { delivery, continuation, key } = props;
  const { commandOperationOutbox } = serviceChainDbConfig.schema;
  const position = and(
    eq(commandOperationOutbox.serviceIndex, delivery.sourceIndex),
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
      Schema.toType(RetainedSystemServiceCommandSchema),
    )(
      {
        ...input,
        serviceName: key.serviceName,
        serviceVersion: delivery.command.continuation?.ownerVersion,
        kind: 'system',
      },
      { onExcessProperty: 'error' },
    );
    yield* appendServiceCommand(tx, command, failure);
  }
  tx.delete(commandOperationOutbox).where(position).run();
});

/** Hold a failed mapper result across a rolled-back child admission. */
export const admitCommandContinuation = Effect.fn(
  'ServiceChain.admitCommandContinuation',
)(function* <E, R>(
  db: IDb<typeof serviceChainDbConfig>,
  props: {
    delivery: ICommandDelivery;
    continuation: typeof CommandContinuationResponseSchema.Type;
    key: { serviceName: string };
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
    const { commandOperationOutbox } = serviceChainDbConfig.schema;
    db.update(commandOperationOutbox)
      .set({ continuationFailure: encoded })
      .where(
        and(
          eq(commandOperationOutbox.serviceIndex, delivery.sourceIndex),
          eq(commandOperationOutbox.operationIndex, delivery.operationIndex),
          isNull(commandOperationOutbox.continuationFailure),
        ),
      )
      .run();
  }
  yield* producerLease;
  yield* admitCommandContinuationTx(db, props);
});
