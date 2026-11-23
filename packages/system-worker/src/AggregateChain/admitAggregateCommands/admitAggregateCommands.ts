import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { validateReleaseAdmission } from '../../ownerOperations/validateReleaseAdmission.js';
import type { IAdmittedAggregateCommands } from '../types.js';

import { admitAggregateCommandsTx } from './admitAggregateCommandsTx.js';
import { classifyAggregateAdmissionFailure } from './classifyAggregateAdmissionFailure.js';
import { validateAggregateNodeBinding } from './validateAggregateNodeContinuation.js';
import { validateAggregateSubmission } from './validateAggregateSubmission.js';

/** Decode once, then decide each command in one synchronous retention transaction. */
export const admitAggregateCommands = makeFn(
  'AggregateChain.admitAggregateCommands',
)(function* (props: {
  commands: readonly unknown[];
  db: IDb;
  key: { systemId: string; aggregateId: string; aggregateName: string };
}) {
  const { commands: submittedCommands, db, key } = props;
  if (submittedCommands.length === 0) {
    const admitted: IAdmittedAggregateCommands = [];
    return admitted;
  }
  if (submittedCommands.length > 64) {
    return yield* makeZerospinError('aggregate-admission-batch-too-large');
  }
  const commands = yield* validateAggregateSubmission(submittedCommands, key);
  yield* Effect.forEach(
    commands,
    command => validateAggregateNodeBinding(db, command),
    { discard: true },
  );
  yield* Effect.forEach(commands, validateReleaseAdmission, { discard: true });
  return yield* admitAggregateCommandsTx(db, { commands, key }).pipe(
    Effect.catchCause(cause => classifyAggregateAdmissionFailure(cause)),
  );
});
