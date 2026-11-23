import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaAST from 'effect/SchemaAST';
import '@zerospin/server-only';

import type { IAssertContractOperationsInModels } from '../../../contracts/assertOperationsUseModels.ts';
import type { IExternalContractDefinition } from '../../../contracts/externalContract.ts';
import { isAggregateContract } from '../../../contracts/make/constructContractRelease.ts';
import type { IInvalidReadProjectionNames } from '../../../contracts/readProjection.ts';
import type {
  IAggregateContracts,
  IAnyContracts,
  IContractRelease,
  IInferContractExecutionRequirements,
} from '../../../contracts/types.ts';
import { ActorIdentitySchema } from '../../../declaration/ActorIdentitySchema.ts';
import { VersionSchema } from '../../../declaration/VersionSchema.ts';
import { AggregateAuthenticationSchema } from '../../../identity/AggregateAuthenticationSchema.ts';
import type { IAggregateAuthentication } from '../../../identity/types.ts';
import { isModel } from '../../../models/make/makeModelVersion.ts';
import {
  captureSelections,
  QueryDbSchema,
  QuerySelection,
  type IAnyQueryDbVersion,
  type ICapturedSelections,
  type IQuerySelections,
  type IValidQuerySelections,
} from '../../../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../../../models/types.ts';
import type {
  IAggregateActorAuthorization,
  IAnyAggregateActorRelease,
} from '../../types.ts';

class AggregateActorRelease {
  readonly kind = 'aggregate';
}
export const AggregateActorReleaseSchema = Schema.declare(
  (input: unknown): input is IAnyAggregateActorRelease =>
    input instanceof AggregateActorRelease,
);
const FunctionSchema = Schema.declare(
  (input: unknown): input is (...args: never[]) => unknown =>
    typeof input === 'function',
);
const AggregateActorReleasePropsSchema = Schema.Struct({
  version: VersionSchema,
  db: QueryDbSchema,
  exposedModels: Schema.Record(Schema.String, Schema.declare(isModel)),
  identity: ActorIdentitySchema,
  authentication: AggregateAuthenticationSchema,
  selections: Schema.Record(
    Schema.String,
    Schema.declare(
      (input: unknown): input is QuerySelection =>
        input instanceof QuerySelection,
    ),
  ),
  contracts: Schema.Record(
    Schema.String,
    Schema.declare((input: unknown): input is IAggregateContracts[string] =>
      isAggregateContract(input),
    ),
  ),
  authorize: FunctionSchema,
});

type IValidActorContractOperations<
  CONTRACT extends IContractRelease,
  MODELS extends IAnyModels,
> =
  IAssertContractOperationsInModels<CONTRACT, MODELS> extends CONTRACT
    ? unknown
    : IAssertContractOperationsInModels<CONTRACT, MODELS>;

export type IValidActorContracts<
  CONTRACTS extends IAnyContracts,
  MODELS extends IAnyModels,
  CLAIMS,
> = {
  [K in keyof CONTRACTS]: CONTRACTS[K] extends {
    readonly external: IExternalContractDefinition;
  }
    ? never
    : K extends CONTRACTS[K]['commandName']
      ? ([IInvalidReadProjectionNames<CONTRACTS[K]['models'], MODELS>] extends [
          never,
        ]
          ? unknown
          : never) &
          IValidActorContractOperations<CONTRACTS[K], MODELS> &
          ([NonNullable<CONTRACTS[K]['claims']>] extends [never]
            ? unknown
            : CLAIMS extends NonNullable<CONTRACTS[K]['claims']>['Type']
              ? unknown
              : never)
      : never;
};

export type IAggregateActorReleaseProps<
  VERSION extends number,
  DB extends IAnyQueryDbVersion,
  MODELS extends IAnyModels,
  IDENTITY extends IAnyAggregateActorRelease['identity'],
  SELECTIONS extends IQuerySelections,
  CONTRACTS extends IAggregateContracts,
  AUTHORIZE_REQUIREMENTS,
  CREDENTIALS extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
> = {
  version: VERSION;
  authentication: IAggregateAuthentication<
    CREDENTIALS,
    IDENTITY['claimsSchema']
  >;
  db: DB;
  exposedModels: MODELS;
  identity: IDENTITY &
    (IDENTITY['claimsSchema']['Type'] extends {
      readonly aggregateId: string;
    }
      ? unknown
      : never);
  selections: SELECTIONS & IValidQuerySelections<DB['models'], SELECTIONS>;
  contracts: CONTRACTS &
    IValidActorContracts<CONTRACTS, MODELS, IDENTITY['claimsSchema']['Type']>;
  authorize?: IAggregateActorAuthorization<
    IDENTITY['claimsSchema']['Type'],
    AUTHORIZE_REQUIREMENTS
  >;
};

export type IAggregateActorRelease<
  NAME extends string,
  VERSION extends number,
  DB extends IAnyQueryDbVersion,
  MODELS extends IAnyModels,
  IDENTITY extends IAnyAggregateActorRelease['identity'],
  SELECTIONS extends IQuerySelections,
  CONTRACTS extends IAggregateContracts,
  AUTHORIZE_REQUIREMENTS,
  AUTHORIZE extends IAnyAggregateActorRelease['authorize'] =
    IAggregateActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >,
> = {
  readonly kind: 'aggregate';
  readonly name: NAME;
  readonly version: VERSION;
  readonly db: DB;
  readonly exposedModels: MODELS;
  readonly identity: IDENTITY;
  readonly authentication: IAggregateAuthentication<
    Schema.Codec<unknown, unknown>,
    IDENTITY['claimsSchema']
  >;
  readonly selections: SELECTIONS;
  readonly capturedSelections: ICapturedSelections<
    DB['models'],
    SELECTIONS,
    IDENTITY['identitySchema']['Type']
  >;
  readonly contracts: CONTRACTS;
  readonly __contractRequirements?: IInferContractExecutionRequirements<
    CONTRACTS[keyof CONTRACTS]
  >;
  readonly authorize: AUTHORIZE;
  readonly __authorizeRequirements?: AUTHORIZE_REQUIREMENTS;
};

export function makeAggregateActorRelease<
  const CREDENTIALS extends Schema.Codec<unknown, unknown>,
  const NAME extends string,
  const VERSION extends number,
  const DB extends IAnyQueryDbVersion,
  const MODELS extends IAnyModels,
  const IDENTITY extends IAnyAggregateActorRelease['identity'],
  const SELECTIONS extends IQuerySelections,
  const CONTRACTS extends IAggregateContracts,
  AUTHORIZE_REQUIREMENTS = never,
>(
  actorDefinition: { name: NAME },
  props: IAggregateActorReleaseProps<
    VERSION,
    DB,
    MODELS,
    IDENTITY,
    SELECTIONS,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS,
    CREDENTIALS
  >,
): NoInfer<
  IAggregateActorRelease<
    NAME,
    VERSION,
    DB,
    MODELS,
    IDENTITY,
    SELECTIONS,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS
  >
> {
  const { authorize, ...actorFields } = props;
  return constructAggregateActorRelease<
    NAME,
    VERSION,
    DB,
    MODELS,
    IDENTITY,
    SELECTIONS,
    CONTRACTS,
    AUTHORIZE_REQUIREMENTS
  >(actorDefinition, {
    ...actorFields,
    authorize: authorize === undefined ? () => Effect.void : authorize,
  });
}

/** Validate the completed declaration and construct from its typed values. */
export function constructAggregateActorRelease<
  const NAME extends string,
  const VERSION extends number,
  const DB extends IAnyQueryDbVersion,
  const MODELS extends IAnyModels,
  const IDENTITY extends IAnyAggregateActorRelease['identity'],
  const SELECTIONS extends IQuerySelections,
  const CONTRACTS extends IAggregateContracts,
  AUTHORIZE_REQUIREMENTS = never,
  AUTHORIZE extends IAnyAggregateActorRelease['authorize'] =
    IAggregateActorAuthorization<
      IDENTITY['claimsSchema']['Type'],
      AUTHORIZE_REQUIREMENTS
    >,
>(
  actorDefinition: { name: NAME },
  props: {
    version: VERSION;
    db: DB;
    exposedModels: MODELS;
    identity: IDENTITY;
    authentication: IAggregateAuthentication<
      Schema.Codec<unknown, unknown>,
      IDENTITY['claimsSchema']
    >;
    selections: SELECTIONS;
    contracts: CONTRACTS;
    authorize: AUTHORIZE;
  },
  previous?: IAnyAggregateActorRelease,
): IAggregateActorRelease<
  NAME,
  VERSION,
  DB,
  MODELS,
  IDENTITY,
  SELECTIONS,
  CONTRACTS,
  AUTHORIZE_REQUIREMENTS,
  AUTHORIZE
> {
  const {
    version,
    db,
    exposedModels,
    identity: authoredIdentity,
    authentication,
    selections,
    contracts,
    authorize,
  } = props;
  for (const contract of Object.values(contracts)) {
    if (!isAggregateContract(contract)) {
      throw new Error('Expected a canonical aggregate contract');
    }
  }
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.NonEmptyString }), {
    onExcessProperty: 'error',
  })(actorDefinition);
  // Keep the original bag so strict decoding still rejects excess fields.
  const decodedProps = Schema.decodeUnknownSync(
    AggregateActorReleasePropsSchema,
    {
      onExcessProperty: 'error',
    },
  )(props);
  const identity = decodedProps.identity;
  const field = identity.claimsSchema.fields.aggregateId;
  const ast = field === undefined ? undefined : SchemaAST.toType(field.ast);
  if (
    ast === undefined ||
    ast.context?.isOptional ||
    !(
      ast._tag === 'String' ||
      (ast._tag === 'Literal' && typeof ast.literal === 'string')
    )
  ) {
    throw new Error(
      'Actor claimsSchema must contain a required string aggregateId',
    );
  }
  if (previous !== undefined) {
    Schema.decodeUnknownSync(AggregateActorReleaseSchema)(previous);
  }
  const fields = {
    name: actorDefinition.name,
    version,
    db,
    exposedModels: { ...exposedModels },
    identity: { ...authoredIdentity },
    authentication: { ...authentication },
    selections: { ...selections },
    capturedSelections: captureSelections(
      db,
      selections,
      authoredIdentity.identitySchema,
      previous?.identity.identitySchema === authoredIdentity.identitySchema
        ? previous
        : undefined,
    ),
    contracts: { ...contracts },
    authorize,
  };
  return Object.assign(new AggregateActorRelease(), fields);
}
