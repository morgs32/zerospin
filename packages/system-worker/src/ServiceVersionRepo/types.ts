import type {
  IReadQuery,
  IReadQueryResult,
} from '@zerospin/core/models/reads/ReadQuerySchema';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import type { IRepoTableData } from '@zerospin/core/system/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';

import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import type { IServiceCommandOccurrence } from '../ServiceChain/types.js';
import type { IEvaluatedServiceCommand } from '../ServiceVersionChain/evaluatedServiceCommand.js';

/**
 * The owning ServiceChain's outbox is the sole sender. After a lost
 * acknowledgement it resends the same admitted command and receives the saved
 * evaluated command for that serviceIndex.
 */
export type IServiceOriginalCommandSubscriber = RpcTarget & {
  receive(
    commands: readonly IServiceCommandOccurrence[],
  ): Promise<
    IRpcEnvelope<readonly IEvaluatedServiceCommand[], IZerospinErrorJson>
  >;
};

export interface IServiceOriginalCommandReceiver {
  readonly executeCommandSubscriber: IServiceOriginalCommandSubscriber;
}

/** Shared native RPC surface of the Service release's materialization. */
export interface IServiceVersionRepo {
  replayCommandsFanoutSubscriber(sourceKey: {
    systemId: string;
    serviceName: string;
  }): RpcTarget & {
    receive(
      delivery: IFanoutDelivery<IServiceCommandOccurrence>,
    ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    catchup(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
    subscribe(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  };
  awaitStartup(): Promise<IRpcEnvelope<void, never>>;
  getRepoTableRows(props: {
    tableName: string;
  }): Promise<IRpcEnvelope<IRepoTableData, IZerospinErrorJson>>;
  authorizeServiceSession(props: {
    serviceSessionLock: IServiceSessionLock;
    sessionName: string;
    claims: Readonly<Record<string, unknown>>;
  }): Promise<IRpcEnvelope<IServiceSessionLock, IZerospinErrorJson>>;
  awaitCommandResult(props: {
    serviceIndex: number;
  }): Promise<IRpcEnvelope<IEvaluatedServiceCommand, IZerospinErrorJson>>;
  executeServiceQuery(
    query: IReadQuery,
  ): Promise<IRpcEnvelope<IReadQueryResult, IZerospinErrorJson>>;
}
