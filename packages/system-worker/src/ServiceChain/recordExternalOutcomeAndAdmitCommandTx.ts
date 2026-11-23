import { RetainedSystemServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import { FailedContinuationPayloadSchema } from '@zerospin/core/contracts/ContinuationPayloadSchema';
import type { IExternalOutcome } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { PublicFailureSchema } from '@zerospin/error';
import { and, eq, isNull } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type {
  ExternalContinuationResponseSchema,
  OwnerExternalContinuationSchema,
} from '../ownerOperations/ownerOperationSchema.js';

import { appendServiceCommand } from './admitServiceCommands/appendServiceCommand.js';
import { serviceChainDbConfig } from './serviceChainDbConfig.js';

type IObservation = {
  externalCommandId: `cmd_${string}`;
  externalOutcome: IExternalOutcome;
  key: { serviceName: string };
};

const outbox = serviceChainDbConfig.tables.externalOperationOutbox;
const table = serviceChainDbConfig.schema.externalOperationOutbox;

/** Keep the first observation before invoking authored code or checking admission capacity. */
const retainExternalOutcomeTx = makeTx('ServiceChain.retainExternalOutcome')(
  function* (tx: ITx<typeof serviceChainDbConfig>, props: IObservation) {
    const position = eq(table.externalCommandId, props.externalCommandId);
    const row = tx.select().from(table).where(position).get();
    if (row === undefined) return;
    const work = yield* outbox.decodeRow(row);
    if (work.externalOutcome !== null) {
      return { ...work, externalOutcome: work.externalOutcome };
    }
    const observed = { ...work, externalOutcome: props.externalOutcome };
    const encoded = yield* outbox.encodeRow(observed);
    tx.update(table)
      .set({ externalOutcome: encoded.externalOutcome })
      .where(position)
      .run();
    return observed;
  },
);

/** The stable child and removal of its pending request commit together. */
const admitExternalContinuationTx = makeTx(
  'ServiceChain.admitExternalContinuation',
)(function* (
  tx: ITx<typeof serviceChainDbConfig>,
  command: typeof RetainedSystemServiceCommandSchema.Type,
  failure: typeof PublicFailureSchema.Type | null,
) {
  const position = eq(table.externalCommandId, command.id);
  const pending = tx.select().from(table).where(position).get();
  if (pending === undefined) return;
  const admitted = yield* appendServiceCommand(tx, command, failure);
  tx.delete(table).where(position).run();
  return admitted;
});

export const recordExternalOutcomeAndAdmitCommandTx = Effect.fn(
  'ServiceChain.recordExternalOutcomeAndAdmitCommand',
)(function* <E, R, LEASE_E, LEASE_R>(
  db: IDb<typeof serviceChainDbConfig>,
  props: IObservation & {
    build(
      version: number,
      input: typeof OwnerExternalContinuationSchema.Type,
    ): Effect.Effect<typeof ExternalContinuationResponseSchema.Type, E, R>;
    producerLease?: Effect.Effect<unknown, LEASE_E, LEASE_R>;
  },
) {
  const work = yield* retainExternalOutcomeTx(db, props);
  if (work === undefined) return;
  const continuation =
    work.continuationFailure ??
    (yield* props.build(work.serviceVersion, {
      _tag: 'ExternalContinuation',
      externalContractName: work.externalContractName,
      externalContractVersion: work.externalContractVersion,
      payload: work.payload,
      externalOutcome: work.externalOutcome,
    }));
  if (continuation.payload === null && work.continuationFailure === null) {
    const encoded = yield* Schema.encodeEffect(
      Schema.fromJsonString(FailedContinuationPayloadSchema),
    )(continuation);
    db.update(table)
      .set({ continuationFailure: encoded })
      .where(
        and(
          eq(table.externalCommandId, work.externalCommandId),
          isNull(table.continuationFailure),
        ),
      )
      .run();
  }
  const { failure, ...input } = continuation;
  const command = yield* Schema.decodeUnknownEffect(
    Schema.toType(RetainedSystemServiceCommandSchema),
  )(
    {
      ...input,
      serviceName: props.key.serviceName,
      id: work.externalCommandId,
      serviceVersion: work.serviceVersion,
      kind: 'system',
    },
    { onExcessProperty: 'error' },
  );
  if (props.producerLease !== undefined) yield* props.producerLease;
  return yield* admitExternalContinuationTx(db, command, failure);
});
