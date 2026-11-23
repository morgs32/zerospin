import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IAnyContracts } from './types.ts';

/** Look up the selected contract in the supplied canonical registry. */
export const getContractOrThrow = Effect.fn('getContractOrThrow')(function* <
  CONTRACTS extends IAnyContracts,
  NAME extends keyof CONTRACTS & string,
>(props: { contracts: CONTRACTS; contractName: NAME }) {
  const { contracts, contractName } = props;

  const contract = contracts[contractName];
  if (contract === undefined) {
    return yield* makeZerospinError('contract-not-found');
  }
  return contract;
});
