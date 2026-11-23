import type { IFrameworkError } from '@zerospin/error';
import type { Effect, Schema } from 'effect';

import {
  isServiceContractDefinition,
  type IServiceContractDefinition,
} from '../definition.ts';
import type { IFailures, IFailureType } from '../failures.ts';
import type { IServiceOperationDefinitions } from '../operationDefinition.ts';
import type {
  IAssertReadProjections,
  IProjectedReadModels,
  IReadProjections,
} from '../readProjection.ts';
import type {
  IContractRelease,
  IContractCallbackInput,
  IContractProgramInput,
  IServiceContractRelease,
} from '../types.ts';

import {
  constructContractRelease,
  readConstructedContract,
  type IPayloadFieldDescriptor,
  type IResultSchemaType,
  type IValidProgramOutput,
} from './constructContractRelease.ts';

export function makeServiceContractRelease<
  COMMAND_NAME extends string,
  PAYLOAD extends Record<string, IPayloadFieldDescriptor>,
  const VERSION extends number,
  RESULT_SCHEMA extends Schema.Codec<unknown, unknown> | undefined = undefined,
  const MODELS extends IReadProjections = Record<never, never>,
  const FAILURE extends IFailures = Record<never, never>,
  CLAIMS extends Schema.Codec<
    Readonly<Record<string, unknown>> | null,
    unknown
  > = never,
  GUARD_REQUIREMENTS = never,
  const OPERATIONS extends IServiceOperationDefinitions = Record<never, never>,
  PROGRAM extends Effect.Effect<
    unknown,
    | IFrameworkError
    | NoInfer<Extract<IFailureType<FAILURE>, { readonly scope: 'contract' }>>,
    unknown
  > = Effect.Effect<void>,
>(
  definition: IServiceContractDefinition<COMMAND_NAME>,
  props: {
    claims?: CLAIMS;
    guard?: (
      input: IContractCallbackInput<
        PAYLOAD,
        IProjectedReadModels<MODELS>,
        [FAILURE] extends [never] ? Record<never, never> : NoInfer<FAILURE>,
        NoInfer<
          [CLAIMS] extends [never]
            ? Readonly<Record<string, unknown>> | null
            : CLAIMS['Type']
        >,
        { aggregateId?: never }
      >,
    ) => Effect.Effect<
      void,
      | IFrameworkError
      | NoInfer<Extract<IFailureType<FAILURE>, { readonly scope: 'contract' }>>,
      GUARD_REQUIREMENTS
    >;
    failures?: FAILURE;
    models?: MODELS & IAssertReadProjections<NoInfer<MODELS>>;
    operations?: OPERATIONS;
    payload: PAYLOAD;
    version: VERSION;
    result?: RESULT_SCHEMA;
    program?: (
      input: IContractProgramInput<
        IContractCallbackInput<
          PAYLOAD,
          IProjectedReadModels<MODELS>,
          [FAILURE] extends [never] ? Record<never, never> : NoInfer<FAILURE>,
          [CLAIMS] extends [never]
            ? Readonly<Record<string, unknown>> | null
            : CLAIMS['Type'],
          { aggregateId?: never }
        >,
        NoInfer<OPERATIONS>
      >,
    ) => PROGRAM &
      NoInfer<IValidProgramOutput<PROGRAM, NoInfer<RESULT_SCHEMA>>>;
  },
) {
  if (!isServiceContractDefinition(definition)) {
    throw new Error('A canonical service contract definition is required');
  }
  return readConstructedContract<
    IServiceContractRelease<
      IContractRelease<
        COMMAND_NAME,
        Readonly<PAYLOAD>,
        VERSION,
        IResultSchemaType<RESULT_SCHEMA>,
        Record<VERSION, Readonly<PAYLOAD>>,
        MODELS,
        PROGRAM,
        Effect.Services<PROGRAM> | GUARD_REQUIREMENTS,
        FAILURE,
        Record<VERSION, FAILURE>,
        CLAIMS,
        GUARD_REQUIREMENTS,
        { aggregateId?: never },
        OPERATIONS
      > & { readonly external?: never }
    > &
      ([CLAIMS] extends [never]
        ? { readonly claims?: never }
        : { readonly claims: CLAIMS })
  >(constructContractRelease(definition, props));
}
