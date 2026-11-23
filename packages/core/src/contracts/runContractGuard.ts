import { makeZerospinError, type IZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import { runAuthoredCallback } from '../execution/runAuthoredCallback.ts';

import { validateFailure } from './failureCodec.ts';
import type {
  IContractRelease,
  IContractCallbackInput,
  IContractFailure,
} from './types.ts';

export type IContractGuardError =
  | IZerospinError<'contract-guard-failed' | 'contract-guard-result-invalid'>
  | Effect.Error<ReturnType<typeof validateFailure>>;

/** Invoke the selected implementation's private guard exactly once. */
export const runContractGuard = Effect.fn('runContractGuard')(
  function* (props: {
    contract: Pick<IContractRelease, 'commandName' | 'version' | 'failures'>;
    guard: (
      input: IContractCallbackInput,
    ) => Effect.Effect<void, IContractFailure, unknown>;
    input: IContractCallbackInput;
  }) {
    const guard = props.guard.bind(props);
    const { contract, input } = props;
    const result = yield* runAuthoredCallback({
      program: Effect.suspend(() => guard(input)),
      code: 'contract-guard-failed',
      validateBusinessFailure: failure =>
        validateFailure(contract, failure, 'contract'),
    });
    if (result !== undefined) {
      return yield* makeZerospinError('contract-guard-result-invalid');
    }
  },
);
