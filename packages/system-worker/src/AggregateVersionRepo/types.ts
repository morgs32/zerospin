import type {
  IAggregateActorSessionLock,
  IAggregateSessionLock,
} from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type {
  IReadQuery,
  IReadQueryResult,
} from '@zerospin/core/models/reads/ReadQuerySchema';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';

import type { IAdmittedAggregateCommand } from '../AggregateChain/types.js';
import type { IEvaluatedAggregateCommand } from '../AggregateVersionChain/evaluatedAggregateCommand.js';
import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';

export type IAggregateOriginalCommandSubscriber = RpcTarget & {
  receive(
    commands: readonly IAdmittedAggregateCommand[],
  ): Promise<
    IRpcEnvelope<readonly IEvaluatedAggregateCommand[], IZerospinErrorJson>
  >;
};

/** Native RPC surface of the Aggregate release's materialization. */
export interface IAggregateVersionRepo {
  readonly finalizeCommandSubscriber: IAggregateOriginalCommandSubscriber;
  replayCommandsFanoutSubscriber(sourceKey: {
    systemId: string;
    aggregateId: string;
    aggregateName: string;
  }): RpcTarget & {
    receive(
      delivery: IFanoutDelivery<IAdmittedAggregateCommand>,
    ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    catchup(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    subscribe(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  };
  awaitStartup(): Promise<IRpcEnvelope<void, never>>;
  getRepoTableRows(props: {
    tableName: string;
  }): Promise<IRpcEnvelope<IRepoTableData, IZerospinErrorJson>>;
  authorizeAggregateSession(props: {
    sessionName: string;
    claims: Readonly<Record<string, unknown>>;
    aggregateSessionLock: IAggregateSessionLock;
  }): Promise<
    IRpcEnvelope<
      { aggregateSessionLock: IAggregateActorSessionLock },
      IZerospinErrorJson
    >
  >;
  awaitCommandResult(props: {
    aggregateIndex: number;
  }): Promise<IRpcEnvelope<IEvaluatedAggregateCommand, IZerospinErrorJson>>;
  executeAggregateQuery(
    query: IReadQuery,
  ): Promise<IRpcEnvelope<IReadQueryResult, IZerospinErrorJson>>;
}
