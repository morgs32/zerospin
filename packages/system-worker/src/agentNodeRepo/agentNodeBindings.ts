import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';

import type { aggregateAgentVersionChainNameUtils } from '../AggregateAgentVersionChain/aggregateAgentVersionChainName.js';
import type { serviceAgentVersionChainNameUtils } from '../ServiceAgentVersionChain/serviceAgentVersionChainName.js';

import type {
  IAgentNodeSubscriber,
  IExpectedAgentInstallation,
} from './agentNodeRuntimeTypes.js';

type IAgentNodeRpc<SOURCE_KEY> = {
  getRepoTableRows(props: {
    tableName: string;
  }): Promise<
    IRpcEnvelope<
      IRepoTableData,
      IZerospinErrorJson<'repo-explorer-table-not-found'>
    >
  >;
  initialize(
    retryFailed?: boolean,
    expectedBinding?: IExpectedAgentInstallation,
  ): Promise<IRpcEnvelope<string | null, IZerospinErrorJson>>;
  nodeFanoutSubscriber(sourceKey: SOURCE_KEY): IAgentNodeSubscriber;
};

export type IAggregateAgentNodeRpc = IAgentNodeRpc<
  Parameters<typeof aggregateAgentVersionChainNameUtils.makeName>[0]
>;
export type IServiceAgentNodeRpc = IAgentNodeRpc<
  Parameters<typeof serviceAgentVersionChainNameUtils.makeName>[0]
>;
