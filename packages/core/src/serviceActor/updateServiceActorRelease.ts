import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IServiceContracts } from '../contracts/types.ts';
import type {
  IAnyQueryDbVersion,
  IQuerySelections,
  IValidQuerySelections,
} from '../models/make/makeQueryDbVersion.ts';
import type { IAnyModels } from '../models/types.ts';

import {
  makeServiceActorRelease,
  ServiceActorReleaseSchema,
} from './make/makeServiceActorRelease.ts';
import type { IAnyServiceActorRelease } from './types.ts';
type IMerge<A, B> = Omit<A, keyof B> & B;

/** Inherit declaration fields; merge selections, contracts, and guards by key. A changed database requires selections constructed from that database. */
export function updateServiceActorRelease<
  const PREVIOUS extends IAnyServiceActorRelease,
  const VERSION extends number,
  const DB extends IAnyQueryDbVersion = PREVIOUS['db'],
  const MODELS extends IAnyModels = PREVIOUS['exposedModels'],
  const IDENTITY extends IAnyServiceActorRelease['identity'] =
    PREVIOUS['identity'],
  const SELECTIONS extends IQuerySelections = {},
  const CONTRACTS extends IServiceContracts = {},
  AUTHORIZE_REQUIREMENTS = Effect.Services<
    ReturnType<NonNullable<PREVIOUS['authorize']>>
  >,
  const CREDENTIALS extends Schema.Codec<unknown, unknown> = Schema.Codec<
    unknown,
    unknown
  >,
  const GUARDS extends Readonly<Record<string, unknown>> = {},
>(
  previous: PREVIOUS,
  changes: {
    version: VERSION;
    selections?: SELECTIONS & IValidQuerySelections<DB['models'], SELECTIONS>;
    contracts?: CONTRACTS;
  } & Partial<
    Omit<
      Parameters<
        typeof makeServiceActorRelease<
          CREDENTIALS,
          PREVIOUS['name'],
          VERSION,
          DB,
          MODELS,
          IDENTITY,
          IMerge<PREVIOUS['selections'], SELECTIONS>,
          AUTHORIZE_REQUIREMENTS,
          IMerge<PREVIOUS['contracts'], CONTRACTS>,
          GUARDS
        >
      >[1],
      'selections' | 'contracts'
    >
  >,
): ReturnType<
  typeof makeServiceActorRelease<
    CREDENTIALS,
    PREVIOUS['name'],
    VERSION,
    DB,
    MODELS,
    IDENTITY,
    IMerge<PREVIOUS['selections'], SELECTIONS>,
    AUTHORIZE_REQUIREMENTS,
    IMerge<PREVIOUS['contracts'], CONTRACTS>,
    IMerge<PREVIOUS['guards'], GUARDS>
  >
>;
export function updateServiceActorRelease(
  previous: unknown,
  changes: unknown,
): unknown {
  const actor = Schema.decodeUnknownSync(ServiceActorReleaseSchema)(previous);
  const overrides = Schema.decodeUnknownSync(
    Schema.Struct({
      version: Schema.Unknown,
      db: Schema.optionalKey(Schema.Unknown),
      exposedModels: Schema.optionalKey(Schema.Unknown),
      identity: Schema.optionalKey(Schema.Unknown),
      authentication: Schema.optionalKey(Schema.Unknown),
      selections: Schema.optionalKey(Schema.Unknown),
      contracts: Schema.optionalKey(Schema.Unknown),
      guards: Schema.optionalKey(Schema.Unknown),
      authorize: Schema.optionalKey(Schema.Unknown),
    }),
    { onExcessProperty: 'error' },
  )(changes);
  return Reflect.apply(makeServiceActorRelease, undefined, [
    { name: actor.name },
    {
      db: actor.db,
      exposedModels: actor.exposedModels,
      identity: actor.identity,
      authentication: actor.authentication,
      ...(actor.authorize === undefined ? {} : { authorize: actor.authorize }),
      ...overrides,
      contracts: {
        ...actor.contracts,
        ...(overrides.contracts === undefined
          ? {}
          : Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown),
            )(overrides.contracts)),
      },
      guards: {
        ...actor.guards,
        ...(overrides.guards === undefined
          ? {}
          : Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown),
            )(overrides.guards)),
      },
      selections: {
        ...actor.selections,
        ...(overrides.selections === undefined
          ? {}
          : Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown),
            )(overrides.selections)),
      },
    },
  ]);
}
