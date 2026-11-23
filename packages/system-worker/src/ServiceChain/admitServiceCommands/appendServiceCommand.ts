import type { RetainedServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeZerospinError, type PublicFailureSchema } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { encodeServiceCommandProvenance } from '../../ServiceVersionChain/evaluatedServiceCommand.js';
import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

/** Allocate and insert the next immutable source position in the admission transaction. */
export const appendServiceCommand = Effect.fn(function* <
  COMMAND extends typeof RetainedServiceCommandSchema.Type,
>(
  tx: ITx<typeof serviceChainDbConfig>,
  command: COMMAND,
  payloadFailure: typeof PublicFailureSchema.Type | null = null,
) {
  if ((command.payload === null) !== (payloadFailure !== null)) {
    return yield* makeZerospinError('service-command-payload-failure-invalid');
  }
  const { admissionPosition } = serviceChainDbConfig.schema;
  const admittedThrough =
    tx.select().from(admissionPosition).get()?.lastIndex ?? 0;
  const handedOffThrough =
    tx.select().from(serviceChainDbConfig.schema.canonicalHistory).get()
      ?.serviceIndex ?? 0;
  if (admittedThrough - handedOffThrough >= 64) {
    return yield* makeZerospinError({
      code: 'service-admission-backlog-full',
      extra: { retryable: true },
    });
  }
  const serviceIndex =
    (tx.select().from(admissionPosition).get()?.lastIndex ?? 0) + 1;
  if (!Number.isSafeInteger(serviceIndex)) {
    return yield* makeZerospinError('service-input-index-exhausted');
  }
  const { serviceName: _serviceName, ...input } = command;
  const row = yield* serviceChainDbConfig.tables.commands.encodeRow({
    ...input,
    ...encodeServiceCommandProvenance(command),
    serviceIndex,
    outcome: null,
    payloadFailure,
  });
  tx.insert(serviceChainDbConfig.schema.commands).values(row).run();
  tx.insert(admissionPosition)
    .values({ singleton: 1, lastIndex: serviceIndex })
    .onConflictDoUpdate({
      target: admissionPosition.singleton,
      set: { lastIndex: serviceIndex },
    })
    .run();
  return { ...command, serviceIndex };
});
