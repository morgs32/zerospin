import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IAggregateContracts } from '../contracts/types.ts';
import type { IAggregateAuthentication } from '../identity/types.ts';
import type {
  IAnyQueryDbVersion,
  IQuerySelections,
  IValidQuerySelections,
} from '../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../models/types.ts';

import {
  AggregateActorReleaseSchema,
  constructAggregateActorRelease,
  type IAggregateActorRelease,
  type IValidActorContracts,
} from './make/makeAggregateActorRelease/makeAggregateActorRelease.ts';
import type {
  IAggregateActorAuthorization,
  IAnyAggregateActorRelease,
} from './types.ts';

type IMerge<A, B> = Omit<A, keyof B> & B;
type ISame<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type IAuthorizeRequirements<
  AUTHORIZE extends IAnyAggregateActorRelease['authorize'],
> = Effect.Services<ReturnType<AUTHORIZE>>;
const ChangesSchema = Schema.Struct({
  version: Schema.Unknown,
  db: Schema.optionalKey(Schema.Unknown),
  exposedModels: Schema.optionalKey(Schema.Unknown),
  identity: Schema.optionalKey(Schema.Unknown),
  authentication: Schema.optionalKey(Schema.Unknown),
  selections: Schema.optionalKey(Schema.Unknown),
  contracts: Schema.optionalKey(Schema.Unknown),
  authorize: Schema.optionalKey(Schema.Unknown),
});

function merge<A extends object, B extends object>(
  previous: A,
  changes?: B,
): IMerge<A, B> {
  return Object.assign({}, previous, changes);
}

/** Inherit omitted fields and replace supplied map entries by key. */
export function updateAggregateActorRelease<
  const PREVIOUS extends IAnyAggregateActorRelease,
  const VERSION extends number,
  const DB extends IAnyQueryDbVersion = PREVIOUS['db'],
  const MODELS extends IAnyModels = PREVIOUS['exposedModels'],
  const IDENTITY extends IAnyAggregateActorRelease['identity'] =
    PREVIOUS['identity'],
  const SELECTIONS extends IQuerySelections = {},
  const CONTRACTS extends IAggregateContracts = {},
  const AUTHORIZE extends IAnyAggregateActorRelease['authorize'] =
    PREVIOUS['authorize'],
  AUTHORIZE_REQUIREMENTS = never,
  const CREDENTIALS extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
>(
  previous: PREVIOUS,
  changes: {
    version: VERSION;
    authentication?: IAggregateAuthentication<
      CREDENTIALS,
      IDENTITY['claimsSchema']
    >;
    db?: DB;
    exposedModels?: MODELS;
    identity?: IDENTITY &
      (IDENTITY['claimsSchema']['Type'] extends {
        readonly aggregateId: string;
      }
        ? unknown
        : never);
    selections?: SELECTIONS & IValidQuerySelections<DB['models'], SELECTIONS>;
    contracts?: CONTRACTS;
    authorize?: AUTHORIZE &
      IAggregateActorAuthorization<
        IDENTITY['claimsSchema']['Type'],
        AUTHORIZE_REQUIREMENTS
      >;
  } & (ISame<DB, PREVIOUS['db']> extends true ? unknown : { db: DB }) &
    (ISame<MODELS, PREVIOUS['exposedModels']> extends true
      ? unknown
      : { exposedModels: MODELS }) &
    (ISame<IDENTITY, PREVIOUS['identity']> extends true
      ? unknown
      : { identity: IDENTITY }) &
    (ISame<AUTHORIZE, PREVIOUS['authorize']> extends true
      ? unknown
      : { authorize: AUTHORIZE }) &
    (IMerge<PREVIOUS['selections'], SELECTIONS> extends IValidQuerySelections<
      DB['models'],
      IMerge<PREVIOUS['selections'], SELECTIONS>
    >
      ? unknown
      : { selections: never }) &
    (IMerge<PREVIOUS['contracts'], CONTRACTS> extends IValidActorContracts<
      IMerge<PREVIOUS['contracts'], CONTRACTS>,
      MODELS,
      IDENTITY['claimsSchema']['Type']
    >
      ? unknown
      : { contracts: never }),
): IAggregateActorRelease<
  PREVIOUS['name'],
  VERSION,
  DB,
  MODELS,
  IDENTITY,
  IMerge<PREVIOUS['selections'], SELECTIONS>,
  IMerge<PREVIOUS['contracts'], CONTRACTS>,
  IAuthorizeRequirements<AUTHORIZE>,
  AUTHORIZE
> {
  Schema.decodeUnknownSync(AggregateActorReleaseSchema)(previous);
  Schema.decodeUnknownSync(ChangesSchema, { onExcessProperty: 'error' })(
    changes,
  );
  const fields = Object.assign(
    {
      db: previous.db,
      exposedModels: previous.exposedModels,
      identity: previous.identity,
      authentication: previous.authentication,
      authorize: previous.authorize,
    },
    changes,
  );
  return constructAggregateActorRelease<
    PREVIOUS['name'],
    VERSION,
    DB,
    MODELS,
    IDENTITY,
    IMerge<PREVIOUS['selections'], SELECTIONS>,
    IMerge<PREVIOUS['contracts'], CONTRACTS>,
    IAuthorizeRequirements<AUTHORIZE>,
    AUTHORIZE
  >(
    { name: previous.name },
    {
      version: changes.version,
      db: fields.db,
      exposedModels: fields.exposedModels,
      identity: fields.identity,
      authentication: fields.authentication,
      authorize: fields.authorize,
      selections: merge(previous.selections, changes.selections),
      contracts: merge(previous.contracts, changes.contracts),
    },
    previous,
  );
}
