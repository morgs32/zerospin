import { mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import {
  encodeServiceCommandProvenance,
  type IEvaluatedServiceCommand,
} from '@zerospin/system-worker/ServiceVersionChain/evaluatedServiceCommand';

import { serviceVersionRepoDbConfig } from '../serviceVersionRepoDbConfig.js';

import type { readServiceOccurrenceTx } from './readServiceOccurrenceTx.js';

/** Resource progress and complete pending messages commit with the business transaction. */
export const retainEvaluatedCommandTx = makeFn(
  'ServiceVersionRepo.retainEvaluatedCommandTx',
)(function* (
  tx: Parameters<typeof readServiceOccurrenceTx>[0],
  command: IEvaluatedServiceCommand,
) {
  const row = yield* serviceVersionRepoDbConfig.tables.serviceVersionChainOutbox
    .encodeRow({ ...command, ...encodeServiceCommandProvenance(command) })
    .pipe(
      mapParseError({
        code: 'service-final-encode-failed',
        prefix: 'Invalid evaluated Service command',
      }),
    );
  tx.insert(serviceVersionRepoDbConfig.schema.serviceVersionChainOutbox)
    .values(row)
    .run();
  const materializationHead = {
    singletonId: 1,
    serviceIndex: command.serviceIndex,
    dispositionChainHash: command.dispositionChainHash,
  };
  tx.insert(serviceVersionRepoDbConfig.schema.materializationHead)
    .values(materializationHead)
    .onConflictDoUpdate({
      target: serviceVersionRepoDbConfig.schema.materializationHead.singletonId,
      set: materializationHead,
    })
    .run();
  return command;
});
