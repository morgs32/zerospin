import type { IAnyError, IFrameworkError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import { assertSameCoreInstance } from '../../assertSameCoreInstance.ts';
import type { IInferCommandPayload } from '../../models/types.ts';
import { AggregateContractRelease } from '../AggregateContractRelease.ts';
import type { DownAdapterRefused } from '../DownAdapterRefused.ts';
import type { IFailures, IFailureType } from '../failures.ts';
import type { IAggregateOperationDefinitions } from '../operationDefinition.ts';
import type {
  IAssertReadProjectionPatch,
  IProjectedReadModels,
  IReadProjection,
} from '../readProjection.ts';
import type {
  IAggregateContractRelease,
  IContractRelease,
  IContractCallbackInput,
  IContractFailure,
  IContractProgramInput,
  IInferContractExecutionRequirements,
} from '../types.ts';

import {
  constructUpgradedContractRelease,
  isAggregateContract,
  readConstructedContract,
  type IPatchedModels,
  type IPatchedPayload,
  type IPayloadFieldDescriptor,
  type IResultSchemaType,
  type IValidProgramOutput,
} from './constructContractRelease.ts';

export function upgradeAggregateContractRelease<
  C extends IAggregateContractRelease & { readonly external?: never },
  const NEXT_VERSION extends number,
  PATCH extends Record<string, IPayloadFieldDescriptor | null> = Record<
    never,
    never
  >,
  const MODEL_PATCH extends Readonly<Record<string, IReadProjection | null>> =
    Record<never, never>,
  const FAILURE extends IFailures = C['failures'],
  CLAIMS extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = NonNullable<C['claims']>,
  GUARD_REQUIREMENTS = NonNullable<C['__guardRequirements']>,
  RESULT_SCHEMA extends Schema.Codec<unknown, unknown> | undefined =
    NonNullable<C['result']>,
  const OPERATIONS extends IAggregateOperationDefinitions = Record<
    never,
    never
  >,
  PROGRAM extends Effect.Effect<unknown, IContractFailure, unknown> =
    NonNullable<C['__program']>,
>(
  contract: C,
  props: {
    claims?: CLAIMS;
    failures?: FAILURE;
    guard?: (
      input: IContractCallbackInput<
        IPatchedPayload<C['payload'], PATCH>,
        IProjectedReadModels<IPatchedModels<C['models'], NoInfer<MODEL_PATCH>>>,
        [FAILURE] extends [never] ? C['failures'] : NoInfer<FAILURE>,
        NoInfer<
          [CLAIMS] extends [never]
            ? Readonly<Record<string, unknown>> | null
            : CLAIMS['Type']
        >,
        { aggregateId: string }
      >,
    ) => Effect.Effect<
      void,
      | IFrameworkError
      | NoInfer<Extract<IFailureType<FAILURE>, { scope: 'contract' }>>,
      GUARD_REQUIREMENTS
    >;
    models?: MODEL_PATCH &
      IAssertReadProjectionPatch<NoInfer<MODEL_PATCH>> & {
        [K in keyof MODEL_PATCH]: MODEL_PATCH[K] extends null
          ? K extends keyof C['models']
            ? null
            : never
          : MODEL_PATCH[K];
      };
    payload?: PATCH & {
      [K in keyof PATCH]: PATCH[K] extends null
        ? K extends keyof C['payload']
          ? null
          : never
        : PATCH[K];
    };
    version: NEXT_VERSION;
    up?: (props: {
      payload: IContractCallbackInput<C['payload']>['payload'];
    }) => Effect.Effect<
      IInferCommandPayload<IPatchedPayload<C['payload'], PATCH>>,
      IAnyError
    >;
    down?: (props: {
      payload: IInferCommandPayload<IPatchedPayload<C['payload'], PATCH>>;
    }) => Effect.Effect<
      | IContractCallbackInput<C['payload']>['payload']
      | typeof DownAdapterRefused,
      IAnyError
    >;
    result?: RESULT_SCHEMA;
    operations?: OPERATIONS;
    program?: (
      input: IContractProgramInput<
        IContractCallbackInput<
          IPatchedPayload<C['payload'], PATCH>,
          IProjectedReadModels<IPatchedModels<C['models'], MODEL_PATCH>>,
          [FAILURE] extends [never] ? C['failures'] : NoInfer<FAILURE>,
          [CLAIMS] extends [never]
            ? Readonly<Record<string, unknown>> | null
            : CLAIMS['Type'],
          { aggregateId: string }
        >,
        NoInfer<Omit<C['operations'], keyof OPERATIONS> & OPERATIONS>
      >,
    ) => PROGRAM &
      NoInfer<
        IValidProgramOutput<PROGRAM, NoInfer<RESULT_SCHEMA>> &
          Effect.Effect<
            unknown,
            | IFrameworkError
            | Extract<IFailureType<FAILURE>, { scope: 'contract' }>,
            unknown
          >
      >;
  },
) {
  assertSameCoreInstance({
    value: contract,
    expected: AggregateContractRelease,
    kind: 'AggregateContractRelease',
  });
  if (!isAggregateContract(contract)) {
    throw new Error('A canonical aggregate contract version is required');
  }
  return readConstructedContract<
    IAggregateContractRelease<
      IContractRelease<
        C['commandName'],
        IPatchedPayload<C['payload'], PATCH>,
        NEXT_VERSION,
        IResultSchemaType<RESULT_SCHEMA>,
        NonNullable<C['__payloads']> &
          Record<NEXT_VERSION, IPatchedPayload<C['payload'], PATCH>>,
        IPatchedModels<C['models'], MODEL_PATCH>,
        PROGRAM,
        | IInferContractExecutionRequirements<C>
        | Effect.Services<PROGRAM>
        | GUARD_REQUIREMENTS,
        FAILURE,
        NonNullable<C['__failures']> & Record<NEXT_VERSION, FAILURE>,
        CLAIMS,
        GUARD_REQUIREMENTS,
        { aggregateId: string },
        Omit<C['operations'], keyof OPERATIONS> & OPERATIONS
      > & { readonly external?: never }
    > &
      ([CLAIMS] extends [never]
        ? { readonly claims?: never }
        : { readonly claims: CLAIMS })
  >(constructUpgradedContractRelease(contract, props));
}
