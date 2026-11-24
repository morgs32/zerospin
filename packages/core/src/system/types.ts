import type { IInferIdFromAbbreviation } from '@zerospin/shapes';
import type { ManagedRuntime, Schema } from 'effect';

import type {
  IAggregateAgentRelease,
  IServiceAgentRelease,
} from '../agent/types.ts';
import type { IAggregateRegistry } from '../aggregate/types.ts';
import type { IRef } from '../models/types.ts';
import type { IServiceRegistry } from '../service/types.ts';

import type { RepoTypeSchema } from './RepoTypeSchema.ts';
import type { SystemSpecSchema } from './SystemSpecSchema.ts';
import type { ITelemetryConfig } from './TelemetryConfigSchema.ts';
export type { ITelemetryConfig } from './TelemetryConfigSchema.ts';
export type IRefRecord = Record<string, IRef>;
export type IGraph = Record<string, IRefRecord>;
export type ISystemEnvironmentId = 'dev' | 'production';
export type ISystemConfig<SYSTEM = ISystem> = Readonly<{
  system: SYSTEM;
  systemId: ISystemId;
  managedRuntime: ManagedRuntime.ManagedRuntime<unknown, never>;
  telemetry?: ITelemetryConfig;
  wrangler?: Schema.JsonObject;
}>;
export type IRepoType = typeof RepoTypeSchema.Type;
export type IRepoRegistration = Readonly<{
  repoType: Exclude<IRepoType, 'SystemRepo'>;
  repoName: string;
  tableNames: readonly string[];
}>;
export type IRepoTableData = Readonly<{
  columns: readonly Readonly<{
    name: string;
    type: string;
    isPrimaryKey: boolean;
    isNullable: boolean;
  }>[];
  rows: readonly Record<string, unknown>[];
}>;
export type ISystemId = IInferIdFromAbbreviation<'sys'>;
export type ISystemSpec = typeof SystemSpecSchema.Type;
export type IAgentRegistry<RELEASE> = Readonly<{
  releases: Readonly<Record<number, RELEASE>>;
  active: number;
}>;
export type IAggregateAgents = Readonly<
  Record<
    string,
    Readonly<Record<string, IAgentRegistry<IAggregateAgentRelease>>>
  >
>;
export type IServiceAgents = Readonly<
  Record<string, Readonly<Record<string, IAgentRegistry<IServiceAgentRelease>>>>
>;

export type IAggregateRegistryEntry<
  RELEASES extends IAggregateRegistry = IAggregateRegistry,
> = Readonly<{
  releases: RELEASES;
}>;
export type IServiceRegistryEntry<
  RELEASES extends IServiceRegistry = IServiceRegistry,
> = Readonly<{
  releases: RELEASES;
}>;

export type ISystem<
  AGGREGATES extends Readonly<Record<string, IAggregateRegistryEntry>> =
    Readonly<Record<string, IAggregateRegistryEntry>>,
  SERVICES extends Readonly<Record<string, IServiceRegistryEntry>> = Readonly<
    Record<string, IServiceRegistryEntry>
  >,
  SYSTEM_NAME extends string = string,
  AGGREGATE_AGENT_NODES extends IAggregateAgents = IAggregateAgents,
  SERVICE_AGENT_NODES extends IServiceAgents = IServiceAgents,
> = {
  readonly name: SYSTEM_NAME;
  readonly aggregates: AGGREGATES;
  readonly services: SERVICES;
  readonly aggregateAgents: AGGREGATE_AGENT_NODES;
  readonly serviceAgents: SERVICE_AGENT_NODES;
};
