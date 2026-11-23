import { ServiceChainedCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IResourceDbConfig, ITx } from '@zerospin/core/drizzle/types';
import type { IAnyModels } from '@zerospin/core/models/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { getCommandPayloadFailure } from '@zerospin/system-worker/getCommandPayloadFailure';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import * as Clock from 'effect/Clock';
import * as Schema from 'effect/Schema';

import { readServiceMaterializationHead } from '../readServiceMaterializationHead.js';
import { type serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

/** Validate occurrence authority and contiguous progress before reading admitted input. */
export const readServiceOccurrenceTx = makeFn(
  'ServiceVersionRepo.readServiceOccurrenceTx',
)(function* (
  tx: ITx<
    IResourceDbConfig<IAnyModels, typeof serviceVersionRepoDbConfig.tables>
  >,
  row: IServiceCommandOccurrence,
  key: {
    systemId: string;
    serviceName: string;
    serviceVersion: number;
  },
  mode: 'original' | 'replay',
) {
  if (row.serviceName !== key.serviceName) {
    return yield* makeZerospinError('service-command-owner-mismatch');
  }
  if (mode === 'original' && row.serviceVersion !== key.serviceVersion) {
    return yield* makeZerospinError('service-original-version-mismatch');
  }
  if (mode === 'replay' && row.outcome === null) {
    return yield* makeZerospinError('service-replay-command-pending');
  }
  const materializationHead = readServiceMaterializationHead(tx);
  const cursor = materializationHead.serviceIndex;
  if (!Number.isSafeInteger(row.serviceIndex) || row.serviceIndex < 1) {
    return yield* makeZerospinError('service-execution-gap');
  }
  if (row.serviceIndex <= cursor) return;
  if (row.serviceIndex !== cursor + 1) {
    return yield* makeZerospinError({
      code: 'service-execution-gap',
      message: 'Admitted history is not contiguous',
    });
  }
  const decodedSourceCommand = yield* Schema.decodeUnknownEffect(
    Schema.toType(ServiceChainedCommandSchema),
  )({ ...row, dispositionChainHash: null }).pipe(
    mapParseError({
      code: 'service-input-invalid',
      prefix: 'Invalid admitted occurrence',
    }),
  );
  const finalizedAt =
    mode === 'original'
      ? new Date(yield* Clock.currentTimeMillis)
      : decodedSourceCommand.outcome?.finalizedAt;
  if (finalizedAt === undefined) {
    return yield* makeZerospinError('service-replay-command-pending');
  }
  const { payloadFailure: _payloadFailure, ...sourceCommand } =
    decodedSourceCommand;
  return {
    command: { ...sourceCommand, outcome: null },
    materializationHead,
    finalizedAt,
    payloadFailure: getCommandPayloadFailure(decodedSourceCommand),
  };
});
