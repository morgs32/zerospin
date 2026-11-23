import type { IFrameworkError, IScopedError } from '@zerospin/error';
import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAnyModels, IInferCommandPayload } from '../models/types.ts';

import type { IFailureType } from './failures.ts';
import type { IContractReadDb } from './make/makeContractReadDb.ts';
import type {
  IAnyContracts,
  IDecodedAggregateCommand,
  IDecodedServiceCommand,
  IServiceSessionSubmissionInput,
  IAggregateSessionSubmissionInput,
} from './types.ts';

export type IOwnerGuards<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
  CLAIMS,
  SCOPE extends IScopedError['scope'],
  REQUIREMENTS = never,
> = {
  readonly [K in keyof CONTRACTS]?: (props: {
    db: IContractReadDb<MODELS>;
    command: SCOPE extends 'aggregate'
      ? IDecodedAggregateCommand | IAggregateSessionSubmissionInput
      : IDecodedServiceCommand | IServiceSessionSubmissionInput;
    payload: IInferCommandPayload<CONTRACTS[K]['payload']>;
    claims: CLAIMS;
    failures: CONTRACTS[K]['failures'];
  }) => Effect.Effect<
    void,
    | IFrameworkError
    | Extract<
        IFailureType<CONTRACTS[K]['failures']>,
        { readonly scope: SCOPE }
      >,
    REQUIREMENTS
  >;
};

// The registry erases each owner's model, payload, and identity parameters.
export type IAnyOwnerGuard = (
  // oxlint-disable-next-line typescript/no-explicit-any -- owner callbacks are validated before registry erasure
  props: any,
) => Effect.Effect<void, IFrameworkError | IScopedError, unknown>;

export const OwnerGuardsSchema = Schema.Record(
  Schema.String,
  Schema.declare(
    (value: unknown): value is IAnyOwnerGuard => typeof value === 'function',
  ),
);
