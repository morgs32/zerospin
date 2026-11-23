import type { IAnyError } from '@zerospin/error';
import type { CuidFactory } from '@zerospin/shapes';
import type * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import type { IOperationDefinitions } from '../contracts/operationDefinition.ts';
import type {
  IContractRelease,
  IInferContractExecutionRequirements,
  IInferContractOperations,
} from '../contracts/types.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import type { System } from '../system/System.ts';

export type IOwnerHostServices = System | CuidFactory | MonotonicFactory;
export type IOwnerReleaseLayer = Layer.Layer<
  never,
  IAnyError,
  IOwnerHostServices
>;
export const OwnerReleaseLayerSchema = Schema.declare(Layer.isLayer);

export type IRequiredOwnerServices<REQUIREMENTS> = [{}] extends [REQUIREMENTS]
  ? never
  : Exclude<REQUIREMENTS, IOwnerHostServices>;

type ICallbackServices<CALLBACK> = CALLBACK extends (
  ...args: never[]
) => Effect.Effect<unknown, unknown, infer R>
  ? R
  : never;

export type IContinuationServices<DECLARATION> = DECLARATION extends {
  readonly onSuccess?: { readonly payload: infer SUCCESS };
  readonly onFailure?: { readonly payload: infer FAILURE };
}
  ? ICallbackServices<SUCCESS> | ICallbackServices<FAILURE>
  : never;

export type IOwnerContractRequirements<CONTRACTS> = {
  [K in keyof CONTRACTS]-?: CONTRACTS[K] extends {
    readonly external: infer EXTERNAL extends { readonly request: unknown };
  }
    ?
        | IRequiredOwnerServices<ICallbackServices<EXTERNAL['request']>>
        | IRequiredOwnerServices<IContinuationServices<EXTERNAL>>
    : CONTRACTS[K] extends IContractRelease
      ?
          | IRequiredOwnerServices<
              IInferContractExecutionRequirements<CONTRACTS[K]>
            >
          | IRequiredOwnerServices<
              IContinuationServices<IInferContractOperations<CONTRACTS[K]>>
            >
      : never;
}[keyof CONTRACTS];

export type IOwnerOperationRequirements<
  OPERATIONS extends IOperationDefinitions,
> = {
  [K in keyof OPERATIONS]-?: IRequiredOwnerServices<
    IContinuationServices<OPERATIONS[K]['schema']['Type']>
  >;
}[keyof OPERATIONS];

type IActorGuardRequirements<ACTOR> = ACTOR extends {
  readonly guards: infer GUARDS;
}
  ? {
      [K in keyof GUARDS]-?: IRequiredOwnerServices<
        ICallbackServices<GUARDS[K]>
      >;
    }[keyof GUARDS]
  : never;

export type IOwnerActorRequirements<
  ACTORS extends Readonly<
    Record<
      string,
      {
        readonly contracts: Readonly<Record<string, IContractRelease>>;
        readonly __authorizeRequirements?: unknown;
      }
    >
  >,
> = {
  [K in keyof ACTORS]-?:
    | IRequiredOwnerServices<NonNullable<ACTORS[K]['__authorizeRequirements']>>
    | IActorGuardRequirements<ACTORS[K]>
    | IOwnerContractRequirements<ACTORS[K]['contracts']>;
}[keyof ACTORS];

export type IOwnerReleaseLayerProps<REQUIREMENTS> = [REQUIREMENTS] extends [
  never,
]
  ? { layer?: IOwnerReleaseLayer }
  : { layer: Layer.Layer<REQUIREMENTS, IAnyError, IOwnerHostServices> };
