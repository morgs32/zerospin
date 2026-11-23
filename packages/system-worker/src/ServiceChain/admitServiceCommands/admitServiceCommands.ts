import { EncodedActorServiceCommandSchema } from '@zerospin/core/contracts/CommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { validateReleaseAdmission } from '../../ownerOperations/validateReleaseAdmission.js';

import { admitServiceCommandsTx } from './admitServiceCommandsTx.js';
import { classifyServiceAdmissionFailure } from './classifyServiceAdmissionFailure.js';
import { validateServiceNodeBinding } from './validateServiceNodeContinuation.js';

/** Decode the complete ordinary envelope once, then recover or admit each occurrence atomically. */
export const admitServiceCommands = makeFn('ServiceChain.admitServiceCommands')(
  function* (props: {
    commands: readonly unknown[];
    db: IDb;
    key: { systemId: string; serviceName: string };
  }) {
    const { key, commands: inputCommands, db } = props;

    const commands = yield* Schema.decodeUnknownEffect(
      Schema.Array(
        EncodedActorServiceCommandSchema.check(
          Schema.makeFilter(
            command =>
              command.serviceName === key.serviceName || {
                path: ['serviceName'],
                issue: 'Command does not match the bound service',
              },
          ),
        ),
      ),
    )(inputCommands, { concurrency: 1, onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'service-admission-encode-failed',
        prefix: 'Invalid service input',
      }),
    );
    if (commands.length > 64) {
      return yield* makeZerospinError('service-admission-batch-too-large');
    }
    yield* Effect.forEach(
      commands,
      command => validateServiceNodeBinding(db, command),
      { discard: true },
    );
    const validated = yield* Effect.forEach(commands, command =>
      validateReleaseAdmission(command).pipe(
        Effect.map(registered => ({ command, registered })),
      ),
    );
    return yield* admitServiceCommandsTx(db, validated).pipe(
      Effect.catchCause(cause => classifyServiceAdmissionFailure(cause)),
    );
  },
);
