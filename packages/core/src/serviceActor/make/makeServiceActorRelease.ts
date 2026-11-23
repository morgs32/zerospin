import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { IValidActorContracts } from '../../aggregateActor/make/makeAggregateActorRelease/makeAggregateActorRelease.ts';
import '@zerospin/server-only';

import { isServiceContract } from '../../contracts/make/constructContractRelease.ts';
import {
  OwnerGuardsSchema,
  type IAnyOwnerGuard,
  type IOwnerGuards,
} from '../../contracts/ownerGuards.ts';
import type { IServiceContracts } from '../../contracts/types.ts';
import { ActorIdentitySchema } from '../../declaration/ActorIdentitySchema.ts';
import { VersionSchema } from '../../declaration/VersionSchema.ts';
import { AuthenticationPolicySchema } from '../../identity/AuthenticationPolicySchema.ts';
import type { IServiceAuthentication } from '../../identity/types.ts';
import { isModel } from '../../models/make/makeModelVersion.ts';
import {
  captureSelections,
  QueryDbSchema,
  QuerySelection,
  type IAnyQueryDbVersion,
  type ICapturedSelections,
  type IQuerySelections,
  type IValidQuerySelections,
} from '../../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../../models/types.ts';
import type {
  IAnyServiceActorRelease,
  IServiceActorAuthorization,
} from '../types.ts';
class ServiceActorRelease {
  readonly kind = 'service';
}
export const ServiceActorReleaseSchema = Schema.declare(
  (input: unknown): input is IAnyServiceActorRelease =>
    input instanceof ServiceActorRelease,
);
const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);
const ServiceActorReleasePropsSchema = Schema.Struct({
  version: VersionSchema,
  db: QueryDbSchema,
  exposedModels: Schema.Record(Schema.String, Schema.declare(isModel)),
  identity: ActorIdentitySchema,
  authentication: AuthenticationPolicySchema,
  contracts: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.declare((value: unknown): value is IServiceContracts[string] =>
        isServiceContract(value),
      ),
    ),
  ),
  guards: Schema.optionalKey(OwnerGuardsSchema),
  selections: Schema.Record(
    Schema.String,
    Schema.declare(
      (input: unknown): input is QuerySelection =>
        input instanceof QuerySelection,
    ),
  ),
  authorize: Schema.optionalKey(FunctionSchema),
});
export type IServiceActorRelease<
  NAME extends string,
  VERSION extends number,
  DB extends IAnyQueryDbVersion,
  MODELS extends IAnyModels,
  IDENTITY extends IAnyServiceActorRelease['identity'],
  SELECTIONS extends IQuerySelections,
  CONTRACTS extends IServiceContracts,
  AUTHORIZE_REQUIREMENTS,
  CREDENTIALS extends Schema.Codec<unknown, unknown>,
  GUARDS extends Readonly<Record<string, unknown>>,
> = {
  readonly kind: 'service';
  readonly contracts: CONTRACTS;
  readonly guards: {
    readonly [K in keyof GUARDS]: Extract<
      GUARDS[K],
      IAnyOwnerGuard | undefined
    >;
  };
  readonly name: NAME;
  readonly version: VERSION;
  readonly db: DB;
  readonly exposedModels: MODELS;
  readonly identity: IDENTITY;
  readonly authentication: IServiceAuthentication<
    CREDENTIALS,
    IDENTITY['claimsSchema']
  >;
  readonly selections: SELECTIONS;
  readonly capturedSelections: ICapturedSelections<
    DB['models'],
    SELECTIONS,
    IDENTITY['identitySchema']['Type']
  >;
  readonly authorize?: IServiceActorAuthorization<
    IDENTITY['claimsSchema']['Type'],
    AUTHORIZE_REQUIREMENTS
  >;
  readonly __authorizeRequirements?: AUTHORIZE_REQUIREMENTS;
};

export function makeServiceActorRelease<
  const CREDENTIALS extends Schema.Codec<unknown, unknown>,
  const NAME extends string,
  const VERSION extends number,
  const DB extends IAnyQueryDbVersion,
  const MODELS extends IAnyModels,
  const IDENTITY extends IAnyServiceActorRelease['identity'],
  const SELECTIONS extends IQuerySelections,
  AUTHORIZE_REQUIREMENTS = never,
  const CONTRACTS extends IServiceContracts = {},
  const GUARDS extends Readonly<Record<string, unknown>> = {},
>(
  actorDefinition: {
    name: NAME;
  },
  props: {
    version: VERSION;
    db: DB;
    exposedModels: MODELS;
    identity: IDENTITY;
    authentication: IServiceAuthentication<
      CREDENTIALS,
      IDENTITY['claimsSchema']
    >;
    contracts?: CONTRACTS &
      IValidActorContracts<CONTRACTS, MODELS, IDENTITY['claimsSchema']['Type']>;
    guards?: GUARDS &
      IOwnerGuards<
        CONTRACTS,
        DB['models'],
        IDENTITY['claimsSchema']['Type'],
        'actor',
        unknown
      > &
      Record<Exclude<keyof GUARDS, keyof CONTRACTS>, never>;
    selections: SELECTIONS & IValidQuerySelections<DB['models'], SELECTIONS>;
    authorize?: IServiceActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >;
  },
): NoInfer<
  IServiceActorRelease<
    NAME,
    VERSION,
    DB,
    MODELS,
    IDENTITY,
    SELECTIONS,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS,
    CREDENTIALS,
    GUARDS
  >
>;
export function makeServiceActorRelease(
  actorDefinition: {
    name: string;
  },
  props: unknown,
): unknown {
  if (
    typeof props === 'object' &&
    props !== null &&
    'contracts' in props &&
    typeof props.contracts === 'object' &&
    props.contracts !== null
  ) {
    mapValues(props.contracts, value =>
      Schema.decodeUnknownSync(Schema.declare(isServiceContract))(value),
    );
  }
  const name = Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.NonEmptyString }),
    { onExcessProperty: 'error' },
  )(actorDefinition).name;
  const decodedProps = Schema.decodeUnknownSync(
    ServiceActorReleasePropsSchema,
    {
      onExcessProperty: 'error',
    },
  )(props);
  const identity = decodedProps.identity;
  const fields = {
    name,
    version: decodedProps.version,
    db: decodedProps.db,
    exposedModels: { ...decodedProps.exposedModels },
    identity: { ...identity },
    authentication:
      typeof decodedProps.authentication === 'string'
        ? decodedProps.authentication
        : { ...decodedProps.authentication },
    contracts: { ...decodedProps.contracts },
    guards: { ...decodedProps.guards },
    selections: { ...decodedProps.selections },
    capturedSelections: captureSelections(
      decodedProps.db,
      decodedProps.selections,
      identity.identitySchema,
    ),
    ...(decodedProps.authorize === undefined
      ? {}
      : { authorize: decodedProps.authorize }),
  };
  return Object.assign(new ServiceActorRelease(), fields);
}
