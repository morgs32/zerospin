import type {
  ITelemetryBatch,
  ITelemetryCollector,
  TelemetryCollector,
} from '@zerospin/logger';
import type { CuidFactory } from '@zerospin/shapes';
import type { StoreApi } from 'zustand/vanilla';

import type { AggregateAgentNode } from '../AggregateAgentNode/AggregateAgentNode.ts';
import type { ISessionId } from '../aggregateSession/types.ts';
import type {
  IAggregateContractRelease,
  IServiceContractRelease,
} from '../contracts/types.ts';
import type { ISQLiteModuleFactory } from '../drizzle/make/makeInMemorySQLite3/waSqliteModuleFactory/waSqliteModuleFactory.ts';
import type {
  IAnyQueryDbVersion,
  ISelection,
} from '../models/make/makeQueryDbVersion.ts';
import type { ServiceAgentNode } from '../ServiceAgentNode/ServiceAgentNode.ts';
import type { MonotonicFactory } from '../services/MonotonicFactory.ts';
import type { ISessionExecution } from '../sessionExecution/types.ts';
import type {
  ISessionFailureReporter,
  ISessionLifecycleState,
} from '../sessionFailure/types.ts';

import type { IAgentCommandRefs } from './makeAgentCommandRef.ts';
import type { IAgentWakeRule } from './makeAgentWake.ts';

/** The canonical authored data shared by registration and transactional execution. */
export type IAggregateAgentRelease<
  DB extends IAnyQueryDbVersion = IAnyQueryDbVersion,
  SELECTIONS extends Readonly<Record<string, ISelection>> = Readonly<
    Record<string, ISelection>
  >,
  CONTRACTS extends IAgentCommandRefs<IAggregateContractRelease> =
    IAgentCommandRefs<IAggregateContractRelease>,
> = Readonly<{
  aggregateName: string;
  aggregateVersion: number;
  agentName: string;
  agentVersion: number;
  sessionName: string;
  db: DB;
  selections: SELECTIONS;
  contracts: CONTRACTS;
  wakeRules: Readonly<Record<string, IAgentWakeRule>>;
}>;

export type IServiceAgentRelease<
  DB extends IAnyQueryDbVersion = IAnyQueryDbVersion,
  SELECTIONS extends Readonly<Record<string, ISelection>> = Readonly<
    Record<string, ISelection>
  >,
  CONTRACTS extends IAgentCommandRefs<IServiceContractRelease> =
    IAgentCommandRefs<IServiceContractRelease>,
> = Readonly<{
  serviceName: string;
  serviceVersion: number;
  agentName: string;
  agentVersion: number;
  sessionName: string;
  db: DB;
  selections: SELECTIONS;
  contracts: CONTRACTS;
  wakeRules: Readonly<Record<string, IAgentWakeRule>>;
}>;

export type IAgentSessionBootstrap = Readonly<{
  snapshot: unknown;
  webSocketUrl: string;
}>;
export type IAggregateAgentSessionInputs = Readonly<{
  aggregateName: string;
  aggregateVersion: number;
  aggregateId: string;
  sqliteModuleFactory?: ISQLiteModuleFactory;
  bootstrap(props: {
    signal: AbortSignal;
    nodeId: string;
    agentName: string;
    agentVersion: number;
    aggregateId: string;
    aggregateName: string;
    aggregateVersion: number;
  }): Promise<IAgentSessionBootstrap>;
}>;
export type IAgentConnectionState = Readonly<{
  status:
    | 'idle'
    | 'loading'
    | 'connecting'
    | 'live'
    | 'reconnecting'
    | 'error'
    | 'disposed';
  error: Error | null;
}>;

/** The lifetime holds one Node; all model/command/progress observations belong to it. */
export type IAggregateAgentSessionState<
  RELEASE extends IAggregateAgentRelease = IAggregateAgentRelease,
> = ISessionLifecycleState & {
  node: AggregateAgentNode<RELEASE> | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
};

/** Studio owns this thin execution/lifecycle facade over one transient Aggregate Agent Node. */
export type IAggregateAgentSession<
  RELEASE extends IAggregateAgentRelease = IAggregateAgentRelease,
  APP_SERVICES = never,
> = ISessionExecution<
  CuidFactory | MonotonicFactory | TelemetryCollector | APP_SERVICES
> & {
  readonly agentRelease: RELEASE;
  readonly reportFailure: ISessionFailureReporter;
  readonly store: Pick<
    StoreApi<IAggregateAgentSessionState<RELEASE>>,
    'getState' | 'getInitialState' | 'subscribe'
  >;
  readonly sessionId: ISessionId | null;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};

export type IServiceAgentSessionInputs = Readonly<{
  serviceName: string;
  serviceVersion: number;
  sqliteModuleFactory?: ISQLiteModuleFactory;
  bootstrap(props: {
    signal: AbortSignal;
    nodeId: string;
    agentName: string;
    agentVersion: number;
    serviceName: string;
    serviceVersion: number;
  }): Promise<IAgentSessionBootstrap>;
}>;

export type IServiceAgentSessionState<
  RELEASE extends IServiceAgentRelease = IServiceAgentRelease,
> = ISessionLifecycleState & {
  node: ServiceAgentNode<RELEASE> | null;
  telemetry: ITelemetryBatch;
  telemetryCollector: ITelemetryCollector;
};

export type IServiceAgentSession<
  RELEASE extends IServiceAgentRelease = IServiceAgentRelease,
  APP_SERVICES = never,
> = ISessionExecution<
  CuidFactory | MonotonicFactory | TelemetryCollector | APP_SERVICES
> & {
  readonly agentRelease: RELEASE;
  readonly reportFailure: ISessionFailureReporter;
  readonly store: Pick<
    StoreApi<IServiceAgentSessionState<RELEASE>>,
    'getState' | 'getInitialState' | 'subscribe'
  >;
  readonly sessionId: ISessionId | null;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};
