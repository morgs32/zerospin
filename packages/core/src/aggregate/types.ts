import type { IAnyAggregateActorRelease } from '../aggregateActor/types.ts';
import type { IAggregateContractExtension } from '../contracts/makeAggregateContractExtension.ts';
import type { IAnyOwnerGuard, IOwnerGuards } from '../contracts/ownerGuards.ts';
import type { IAggregateContracts } from '../contracts/types.ts';
import type { IOwnerReleaseLayer } from '../execution/ownerReleaseLayer.ts';
import type { IAnyModels } from '../models/types.ts';

export type IAggregateReleaseIdentity<
  NAME extends string = string,
  VERSION extends number = number,
> = Readonly<{
  name: NAME;
  version: VERSION;
}>;

export type IAggregateReleaseHistory<BRANCH, REBUILD = BRANCH> =
  | { readonly branchFrom?: never; readonly rebuildFrom?: never }
  | { readonly branchFrom: BRANCH; readonly rebuildFrom?: never }
  | { readonly branchFrom?: never; readonly rebuildFrom: REBUILD };

export type IAggregateRelease<
  NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  ACTORS extends Record<string, IAnyAggregateActorRelease> = Record<
    string,
    IAnyAggregateActorRelease
  >,
  VERSION extends number = number,
  GUARD_REQUIREMENTS = never,
  CONTRACTS extends IAggregateContracts = IAggregateContracts,
  SYSTEM extends IAggregateContracts = IAggregateContracts,
  EXTERNAL extends IAggregateContracts = IAggregateContracts,
  HISTORY extends IAggregateReleaseHistory<IAggregateReleaseIdentity<NAME>> =
    IAggregateReleaseHistory<IAggregateReleaseIdentity<NAME>>,
> = {
  readonly layer?: IOwnerReleaseLayer;
  readonly definition: Readonly<{ name: NAME }>;
  readonly name: NAME;
  readonly version: VERSION;
  readonly models: Readonly<MODELS>;
  readonly contracts: Readonly<CONTRACTS>;
  readonly system: Readonly<SYSTEM>;
  readonly external: Readonly<EXTERNAL>;
  readonly extensions: Readonly<Record<string, IAggregateContractExtension>>;
  readonly actors: Readonly<ACTORS>;
  readonly guards: {
    readonly [K in keyof ACTORS]?: IOwnerGuards<
      ACTORS[K]['contracts'],
      MODELS,
      ACTORS[K]['identity']['claimsSchema']['Type'],
      'aggregate',
      GUARD_REQUIREMENTS
    >;
  };
} & HISTORY;

export type IAnyAggregateRelease = {
  readonly layer?: IOwnerReleaseLayer;
  readonly definition: Readonly<{ name: string }>;
  readonly name: string;
  readonly version: number;
  readonly models: IAnyModels;
  readonly contracts: IAggregateContracts;
  readonly system: IAggregateContracts;
  readonly external: IAggregateContracts;
  readonly extensions: Readonly<Record<string, IAggregateContractExtension>>;
  readonly actors: Readonly<Record<string, IAnyAggregateActorRelease>>;
  readonly guards: Readonly<
    Record<
      string,
      Readonly<Record<string, IAnyOwnerGuard | undefined>> | undefined
    >
  >;
} & IAggregateReleaseHistory<IAggregateReleaseIdentity>;

/** All declared versions of one aggregate owner. */
export type IAggregateRegistry = Readonly<Record<number, IAnyAggregateRelease>>;
