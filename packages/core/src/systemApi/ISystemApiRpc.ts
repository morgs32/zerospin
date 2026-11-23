import type { IZerospinErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';
import type { RpcTarget } from 'capnweb';

import type { IAggregateAgentSessionSnapshot } from '../agent/AggregateAgentSessionSnapshotSchema.ts';
import type { ICommandOutcome } from '../contracts/CommandOutcomeSchema.ts';
import type {
  DirectSystemAggregateCommandSchema,
  DirectSystemServiceCommandSchema,
} from '../contracts/CommandSchema.ts';
import type { IReadQueryResult } from '../models/reads/ReadQuerySchema.ts';
import type { IServiceAgentSessionSnapshot } from '../serviceAgentSession/ServiceAgentSessionSnapshotSchema.ts';
import type { IOwnerReleaseIdentity } from '../system/ownerReleaseDeployment.ts';
import type {
  IRepoTableData,
  IRepoType,
  ISystemId,
  ISystemSpec,
} from '../system/types.ts';

import type { IAggregateQuery } from './AggregateQuerySchema.ts';
import type { IDeploymentWorkerVersionArgs } from './DeploymentWorkerVersionArgsSchema.ts';
import type { IOpenAggregateAgentSessionRequest } from './OpenAggregateAgentSessionRequestSchema.ts';
import type { IOpenServiceAgentSessionRequest } from './OpenServiceAgentSessionRequestSchema.ts';
import type { IServiceQuery } from './ServiceQuerySchema.ts';

/** Administrative wire protocol; local typed selections never cross this boundary. */
export interface ISystemApiRpc extends RpcTarget {
  healthcheck(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string, IZerospinErrorJson>>;
  initialize(
    request: IRpcRequest<IDeploymentWorkerVersionArgs>,
  ): Promise<ILinkedRpcEnvelope<void, IZerospinErrorJson>>;
  executeServiceQuery(
    request: IRpcRequest<[IServiceQuery]>,
  ): Promise<ILinkedRpcEnvelope<IReadQueryResult, IZerospinErrorJson>>;
  executeAggregateCommand(
    request: IRpcRequest<
      [{ command: typeof DirectSystemAggregateCommandSchema.Encoded }]
    >,
  ): Promise<ILinkedRpcEnvelope<ICommandOutcome, IZerospinErrorJson>>;
  executeServiceCommand(
    request: IRpcRequest<
      [{ command: typeof DirectSystemServiceCommandSchema.Encoded }]
    >,
  ): Promise<ILinkedRpcEnvelope<ICommandOutcome, IZerospinErrorJson>>;
  executeAggregateQuery(
    request: IRpcRequest<[IAggregateQuery]>,
  ): Promise<ILinkedRpcEnvelope<IReadQueryResult, IZerospinErrorJson>>;
  getRepoRegistrations(
    request: IRpcRequest<[{ repoType: IRepoType }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      readonly {
        repoType: IRepoType;
        repoName: string;
        tableNames: readonly string[];
      }[],
      IZerospinErrorJson
    >
  >;
  getRepoTableRows(
    request: IRpcRequest<
      [{ repoType: IRepoType; repoName: string; tableName: string }]
    >,
  ): Promise<ILinkedRpcEnvelope<IRepoTableData, IZerospinErrorJson>>;
  preflightDeployment(
    request: IRpcRequest<[{ systemId: ISystemId; systemSpec: ISystemSpec }]>,
  ): Promise<
    ILinkedRpcEnvelope<
      {
        versionId: string | null;
        bootstrap: boolean;
        acceptedOwnerReleases: readonly IOwnerReleaseIdentity[];
      },
      IZerospinErrorJson
    >
  >;
  acceptSystemSpec(
    request: IRpcRequest<IDeploymentWorkerVersionArgs>,
  ): Promise<ILinkedRpcEnvelope<void, IZerospinErrorJson>>;
  getExecutingWorkerVersion(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<string | null, IZerospinErrorJson>>;
  makeSystemSpec(
    request: IRpcRequest<[]>,
  ): Promise<ILinkedRpcEnvelope<ISystemSpec, IZerospinErrorJson>>;
  openAggregateAgentSession(
    request: IRpcRequest<[IOpenAggregateAgentSessionRequest]>,
  ): Promise<
    ILinkedRpcEnvelope<
      { snapshot: IAggregateAgentSessionSnapshot; ticket: string },
      IZerospinErrorJson
    >
  >;
  openServiceAgentSession(
    request: IRpcRequest<[IOpenServiceAgentSessionRequest]>,
  ): Promise<
    ILinkedRpcEnvelope<
      { snapshot: IServiceAgentSessionSnapshot; ticket: string },
      IZerospinErrorJson
    >
  >;
  getAgentAggregateIds(
    request: IRpcRequest<[{ aggregateName: string; aggregateVersion: number }]>,
  ): Promise<ILinkedRpcEnvelope<readonly string[], IZerospinErrorJson>>;
}
