import type {
  ITelemetryBatch,
  ITelemetryCollector,
  TelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory, IInferIdFromAbbreviation } from '@zerospin/shapes';
import type { AnyRelations } from 'drizzle-orm';
import { type Schema, type Scope } from 'effect';
import type { StoreApi } from 'zustand';

import type { INodeState } from '../aggregateSession/NodeState.ts';
import type { IBrowserCommand } from '../contracts/BrowserCommandSchema.ts';
import type {
  IAggregateContractRelease,
  IInferContractExecutionRequirements,
} from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IResourceDbConfig,
  IResourceDrizzleSchemasFromModels,
  ISqliteDrizzleDb,
} from '../drizzle/types.ts';
import type {
  IAggregateId,
  IAnyModels,
  IEncodedResourceShape,
  IRef,
} from '../models/types.ts';
import type { IDevelopmentHistory } from '../Node/DevelopmentHistorySchema.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import type { ISessionExecution } from '../sessionExecution/types.ts';
import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from '../sessionFailure/types.ts';
import type { ISystemEnvironmentId } from '../system/types.ts';

import { type aggregateSessionRepoDbConfig } from './aggregateSessionRepoDbConfig.ts';
import type { IInitializedAggregateSession } from './makeInitializedAggregateSession.ts';

export type IAggregateSessionDefinition<
  SYSTEM_NAME extends string = string,
  AGGREGATE_NAME extends string = string,
  DEFINITION_NAME extends string = string,
  CONTRACTS extends Readonly<Record<string, IAggregateContractRelease>> =
    Readonly<Record<string, IAggregateContractRelease>>,
  MODELS extends IAnyModels = IAnyModels,
  AGGREGATE_VERSION extends number = number,
  CLAIMS extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
> = Readonly<{
  readonly __initializeRequirements?:
    | IInferContractExecutionRequirements<CONTRACTS[keyof CONTRACTS]>
    | Scope.Scope;
  systemName: SYSTEM_NAME;
  aggregateName: AGGREGATE_NAME;
  aggregateVersion: AGGREGATE_VERSION;
  actorName: string;
  actorVersion: number;
  claimsSchema: CLAIMS;
  sessionName: DEFINITION_NAME;
  contracts: Readonly<CONTRACTS>;
  models: Readonly<MODELS>;
  modelNames: readonly string[];
}>;

export type IAnyAggregateSessionDefinition<INITIALIZE_REQUIREMENTS = never> =
  Readonly<{
    readonly __initializeRequirements?: INITIALIZE_REQUIREMENTS | Scope.Scope;
    systemName: string;
    aggregateName: string;
    aggregateVersion: number;
    actorName: string;
    actorVersion: number;
    claimsSchema: Schema.Struct<
      Readonly<Record<string, Schema.Codec<unknown, unknown>>>
    >;
    sessionName: string;
    contracts: Readonly<Record<string, IAggregateContractRelease>>;
    models: Readonly<IAnyModels>;
    modelNames: readonly string[];
  }>;

export type IAggregateSessionRepoSchema =
  typeof aggregateSessionRepoDbConfig.schema;

export type IAggregateSessionSchema<MODELS extends IAnyModels = IAnyModels> =
  IResourceDrizzleSchemasFromModels<MODELS> & IAggregateSessionRepoSchema;

export type IAggregateSessionDrizzleDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IDb<IDbConfig<IAggregateSessionSchema<MODELS>, RELATIONS>>;

export type IAggregateSessionSqliteDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = ISqliteDrizzleDb<IDbConfig<IAggregateSessionSchema<MODELS>, RELATIONS>>;

export type ISessionId = IInferIdFromAbbreviation<'sesn'>;

export type IActorDelta = Readonly<{
  upserted: readonly IEncodedResourceShape[];
  deleted: readonly IRef[];
}>;

export type IAggregateExposedCommand = IBrowserCommand &
  Readonly<{
    aggregateIndex: number;
    dispositionChainHash: string;
  }>;

export type IAggregateSessionSnapshot = Readonly<{
  developmentHistory?: IDevelopmentHistory;
  environment: ISystemEnvironmentId;
  aggregateId: IAggregateId;
  actorName: string;
  actorVersion: number;
  claims: Readonly<Record<string, unknown>>;
  aggregateName: string;
  aggregateVersion: number;
  sessionName: string;
  aggregateIndex: number;

  dispositionChainHash: string;
  resolvedThrough: number;
  resources: readonly IEncodedResourceShape[];
}>;

export interface IInitializedAggregateSessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
  DB extends ISqliteDrizzleDb = ISqliteDrizzleDb<
    IDbConfig<
      IAggregateSessionSchema<MODELS>,
      IResourceDbConfig<
        MODELS,
        typeof aggregateSessionRepoDbConfig.tables
      >['relations']
    >
  >,
> extends ISessionLifecycleState {
  initialized: IInitializedAggregateSession<DEFINITION, DB, CLAIMS>;
  aggregateIndex: number;

  dispositionChainHash: string;
  pushIndex: number;
  nodeState?: INodeState | null;

  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
}

type IUninitializedAggregateSessionState = ISessionLifecycleState & {
  initialized: null;
  aggregateIndex: number | null;

  dispositionChainHash: string | null;
  pushIndex: number | null;
  nodeState?: INodeState | null;

  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
};

export type IAggregateSessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
  DB extends ISqliteDrizzleDb =
    IInitializedAggregateSessionState<MODELS>['initialized']['db'],
> =
  | IInitializedAggregateSessionState<MODELS, CLAIMS, DEFINITION, DB>
  | IUninitializedAggregateSessionState;

type IAggregateSessionStoreApi<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
> = StoreApi<IAggregateSessionState<MODELS, CLAIMS, DEFINITION>>;

export type IAggregateSessionServices<
  DEFINITION extends IAggregateSessionDefinition,
  SERVICES = never,
> =
  | CuidFactory
  | MonotonicFactory
  | TelemetryCollector
  | Exclude<
      IInferContractExecutionRequirements<
        DEFINITION['contracts'][keyof DEFINITION['contracts']]
      >,
      Scope.Scope
    >
  | SERVICES;

/** The real aggregate session viewed through the contracts a caller can submit. */
export type IAggregateCommandSession<
  CONTRACTS extends Readonly<Record<string, IAggregateContractRelease>>,
  SERVICES = never,
> = {
  readonly sessionDefinition: { readonly contracts: CONTRACTS };
  readonly reportFailure: ISessionFailureReporter;
  readonly runSync: ISessionExecution<
    | CuidFactory
    | MonotonicFactory
    | TelemetryCollector
    | Exclude<
        IInferContractExecutionRequirements<CONTRACTS[keyof CONTRACTS]>,
        Scope.Scope
      >
    | SERVICES
  >['runSync'];
  readonly store: {
    getState(): ISessionLifecycleState & {
      initialized: IInitializedAggregateSession | null;
    };
  };
};

export type IAggregateSession<
  DEFINITION extends IAggregateSessionDefinition = IAggregateSessionDefinition,
  SERVICES = never,
> = ISessionExecution<IAggregateSessionServices<DEFINITION, SERVICES>> & {
  readonly reportFailure: ISessionFailureReporter;
  readonly sessionDefinition: DEFINITION;

  /**
   * One-shot readiness callback. Registration after initialization invokes
   * the handler synchronously; registration before it fires once in the next
   * microtask after the initialized transition. Success-only: a failed
   * bootstrap never fires it. Returns an unsubscribe for pending handlers.
   */
  onInitialized(
    handler: (props: {
      state: IInitializedAggregateSessionState<
        DEFINITION['models'],
        DEFINITION['claimsSchema']['Type'],
        DEFINITION
      >;
    }) => void,
  ): () => void;
  /** Publish the complete uninitialized state synchronously; resource disposal belongs to the runtime. */
  release(): void;
  readonly sessionId: ISessionId | null;
  store: IAggregateSessionStoreApi<
    DEFINITION['models'],
    DEFINITION['claimsSchema']['Type'],
    DEFINITION
  >;
};
