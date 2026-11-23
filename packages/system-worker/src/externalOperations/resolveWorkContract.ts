import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IPreparedExternalOperation } from './externalOperation.js';

/** Pending work resolves only in the containing repo's authored release. */
export const resolveWorkContract = Effect.fn('resolveWorkContract')(function* (
  release: IAnyAggregateRelease | IAnyServiceRelease | undefined,
  work: Pick<
    IPreparedExternalOperation,
    'externalContractName' | 'externalContractVersion'
  >,
) {
  if (release === undefined) {
    return yield* makeZerospinError('external-operation-owner-unavailable');
  }
  const contract = release.external[work.externalContractName];
  if (
    contract === undefined ||
    contract.external === undefined ||
    contract.version !== work.externalContractVersion
  ) {
    return yield* makeZerospinError(
      'external-operation-definition-unavailable',
    );
  }
  return contract;
});
