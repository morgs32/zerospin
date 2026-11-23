import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import type { IContractRelease } from './types.ts';

export function getVersion<CONTRACT extends IContractRelease>(
  contract: CONTRACT,
  requestedVersion: number,
): Effect.Effect<
  CONTRACT | NonNullable<CONTRACT['previous']>,
  IZerospinError<'contract-version-unsupported'>
> {
  return makeFn('contracts.getVersion')(function* (
    contract: CONTRACT,
    requestedVersion: number,
  ) {
    let selected: CONTRACT | NonNullable<CONTRACT['previous']> = contract;
    while (selected.version !== requestedVersion) {
      if (selected.previous === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'contract-version-unsupported',
            message: `Contract "${selected.commandName}" is version "${selected.version}", not "${requestedVersion}"`,
            extra: {
              commandName: selected.commandName,
              currentVersion: selected.version,
              requestedVersion,
            },
          }),
        );
      }
      selected = selected.previous;
    }
    return selected;
  })(contract, requestedVersion);
}
