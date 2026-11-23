import type { IAnyError } from '@zerospin/error';
import type { ITelemetryBatch, ITelemetryCollector } from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/shapes';
import type { AnyRelations } from 'drizzle-orm';
import type { Effect, Schema } from 'effect';
import type { StoreApi } from 'zustand';

import type { INodeState } from '../aggregateSession/NodeState.ts';
import type { ISessionId } from '../aggregateSession/types.ts';
import type { IBrowserCommand } from '../contracts/BrowserCommandSchema.ts';
import type { IFailure } from '../contracts/failureCodec.ts';
import type {
  IInferContractResult,
  IServiceContractRelease,
} from '../contracts/types.ts';
import type {
  IDb,
  IDbConfig,
  IResourceDbConfig,
  IResourceDrizzleSchemasFromModels,
  ISqliteDrizzleDb,
} from '../drizzle/types.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';
import type { IDevelopmentHistory } from '../Node/DevelopmentHistorySchema.ts';
import type { IServiceNodeCommand } from '../ServiceNode/types.ts';
import type { ISessionExecution } from '../sessionExecution/types.ts';
import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from '../sessionFailure/types.ts';
import type { ISystemEnvironmentId } from '../system/types.ts';

import type { ServiceSessionCommandExecution } from './ServiceSessionCommandExecution.ts';
import {
  type serviceSessionRepoSchema,
  type serviceSessionRepoTables,
} from './serviceSessionRepoTables.ts';
export type IServiceSessionDefinition<
  SYSTEM_NAME extends string = string,
  SERVICE_NAME extends string = string,
  DEFINITION_NAME extends string = string,
  MODELS extends IAnyModels = IAnyModels,
  SERVICE_VERSION extends number = number,
  CLAIMS extends Schema.Struct<
    Readonly<Record<string, Schema.Codec<unknown, unknown>>>
  > = Schema.Struct<Readonly<Record<string, Schema.Codec<unknown, unknown>>>>,
> = Readonly<{
  kind: 'service';
  systemName: SYSTEM_NAME;
  serviceName: SERVICE_NAME;
  serviceVersion: SERVICE_VERSION;
  actorName: string;
  actorVersion: number;
  claimsSchema: CLAIMS;
  sessionName: DEFINITION_NAME;
  contracts: Readonly<Record<string, IServiceContractRelease>>;
  models: Readonly<MODELS>;
  modelNames: readonly string[];
}>;
export type IServiceSessionRepoSchema = typeof serviceSessionRepoSchema;
export type IServiceSessionSchema<MODELS extends IAnyModels = IAnyModels> =
  IResourceDrizzleSchemasFromModels<MODELS> & IServiceSessionRepoSchema;
export type IServiceSessionDrizzleDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = IDb<IDbConfig<IServiceSessionSchema<MODELS>, RELATIONS>>;
export type IServiceSessionSqliteDb<
  MODELS extends IAnyModels = IAnyModels,
  RELATIONS extends AnyRelations = AnyRelations,
> = ISqliteDrizzleDb<IDbConfig<IServiceSessionSchema<MODELS>, RELATIONS>>;
export type IServiceExposedCommand = IBrowserCommand &
  Readonly<{
    serviceIndex: number;
    dispositionChainHash: string;
  }>;

export type IServiceSessionSnapshot = Readonly<{
  developmentHistory?: IDevelopmentHistory;
  environment: ISystemEnvironmentId;
  resolvedThrough: number;
  serviceIndex: number;
  actorName: string;
  actorVersion: number;
  claims: Readonly<Record<string, unknown>>;
  serviceName: string;
  sessionName: string;
  dispositionChainHash: string;
  serviceVersion: number;
  resources: readonly IEncodedResourceShape[];
}>;
export type IInitializedServiceSession<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> = Readonly<{
  sessionId: ISessionId;
  claims: CLAIMS;
  encodedClaims: Readonly<Record<string, unknown>>;
  serviceName: string;
  sessionName: string;
  serviceSessionLockKey: string;
  db: IServiceSessionSqliteDb<
    MODELS,
    IResourceDbConfig<MODELS, typeof serviceSessionRepoTables>['relations']
  >;
  schema: IServiceSessionSchema<MODELS>;
  models: MODELS;
  serviceIndex: number;
  dispositionChainHash: string;
  serviceVersion: number;
}>;
export type IServiceSessionState<
  MODELS extends IAnyModels = IAnyModels,
  CLAIMS = Readonly<Record<string, unknown>>,
> = Readonly<
  ISessionLifecycleState & {
    initialized: IInitializedServiceSession<MODELS, CLAIMS> | null;
    nodeState?: INodeState | null;
    telemetry: ITelemetryBatch;
    telemetryCollector: ITelemetryCollector;
  }
>;
export type IServiceSessionSubmission<RESULT = unknown> = Omit<
  IServiceNodeCommand,
  'stagingOutcome' | 'id' | 'nodeId' | 'nodeIndex' | 'pushIndex'
> &
  Readonly<{
    stagingOutcome: Omit<IServiceNodeCommand['stagingOutcome'], 'result'> &
      Readonly<{ result: RESULT }>;
  }>;
export type IServiceSessionCommandExecution<SERVICES = never> = Readonly<{
  stage<CONTRACT extends IServiceContractRelease>(props: {
    contract: CONTRACT;
    payload: unknown;
  }): Effect.Effect<
    {
      command: IServiceNodeCommand;
      result: IInferContractResult<CONTRACT>;
    },
    IAnyError | IFailure,
    SERVICES
  >;
  validate(props: {
    contract: IServiceContractRelease;
    payload: unknown;
  }): Effect.Effect<void, IAnyError | IFailure, SERVICES>;
}>;
export type IServiceSession<
  DEFINITION extends IServiceSessionDefinition = IServiceSessionDefinition,
  MODELS extends IAnyModels = DEFINITION['models'],
  SERVICES = never,
> = ISessionExecution<SERVICES | CuidFactory | ServiceSessionCommandExecution> &
  Readonly<{
    reportFailure: ISessionFailureReporter;
    bindCommandExecution(
      execution: IServiceSessionCommandExecution<SERVICES>,
    ): () => void;
    release(): void;
    sessionDefinition: DEFINITION;
    models: MODELS;
    sessionId: ISessionId | null;
    onInitialized(
      handler: (props: {
        state: IInitializedServiceSession<
          MODELS,
          DEFINITION['claimsSchema']['Type']
        >;
      }) => void,
    ): () => void;
    store: StoreApi<
      IServiceSessionState<MODELS, DEFINITION['claimsSchema']['Type']>
    >;
  }>;
