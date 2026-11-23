import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import { readPendingServiceCommand } from '../readPendingServiceCommand.js';
import type { ServiceChain } from '../ServiceChain.js';
import { serviceChainDbConfig } from '../serviceChainDbConfig.js';

/** Execute originals only through the fixed admitted checkpoint captured by this call. */
export const executeCommandsThrough = makeFn(
  'ServiceChain.executeCommandsThrough',
)(function* (props: {
  db: IDb;
  serviceIndex?: number | undefined;
  executeCommandOutbox: Pick<ServiceChain['executeCommandOutbox'], 'drain'>;
}) {
  const { serviceIndex, db, executeCommandOutbox } = props;

  const admittedThrough = () =>
    db.select().from(serviceChainDbConfig.schema.admissionPosition).get()
      ?.lastIndex ?? 0;
  const checkpoint = serviceIndex ?? admittedThrough();
  if (!Number.isSafeInteger(checkpoint) || checkpoint < 0) {
    return yield* makeZerospinError('service-execution-index-invalid');
  }
  yield* executeCommandOutbox.drain(checkpoint);
  const tip = admittedThrough();
  if (checkpoint > tip) {
    return yield* makeZerospinError('service-execution-index-unavailable');
  }
  if (readPendingServiceCommand(db, checkpoint) !== undefined) {
    return yield* makeZerospinError('service-original-outcome-pending');
  }
});
