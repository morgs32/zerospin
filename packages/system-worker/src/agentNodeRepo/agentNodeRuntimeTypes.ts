import type { IAggregateExposedCommand } from '@zerospin/core/aggregateSession/types';
import type {
  IAggregateCommand,
  IEncodedCommand,
  IServiceCommand,
} from '@zerospin/core/contracts/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IServiceExposedCommand } from '@zerospin/core/serviceSession/types';
import { ensureZerospinError, type IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';

import type { aggregateAgentNodeRepoDbConfig } from '../AggregateAgentNodeRepo/aggregateAgentNodeRepoDbConfig.js';
import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import type { serviceAgentNodeRepoDbConfig } from '../ServiceAgentNodeRepo/serviceAgentNodeRepoDbConfig.js';

export type IExpectedAgentInstallation = Readonly<
  {
    agentVersion: number;
  } & ({ aggregateVersion: number } | { serviceVersion: number })
> | null;

export type IAgentNodeCommand =
  | IEncodedCommand<IAggregateCommand>
  | IEncodedCommand<IServiceCommand>;
export type IAgentNodeDelivery =
  | typeof aggregateAgentNodeRepoDbConfig.tables.commandDeliveryOutbox.codec.Type
  | typeof serviceAgentNodeRepoDbConfig.tables.commandDeliveryOutbox.codec.Type;
export type IAgentNodeExposedCommand =
  | IAggregateExposedCommand
  | IServiceExposedCommand;
export type IAgentNodeCheckpoint =
  | Readonly<{
      agentVersion: number;
      aggregateVersion: number;
      aggregateIndex: number;
      dispositionChainHash: string;
    }>
  | Readonly<{
      agentVersion: number;
      serviceVersion: number;
      serviceIndex: number;
      dispositionChainHash: string;
    }>;
export type IAgentNodeSnapshot = IAgentNodeCheckpoint &
  Readonly<{
    resources: readonly IEncodedResourceShape[];
  }>;

export type IAgentNodeSubscriber = RpcTarget & {
  receive(
    delivery: IFanoutDelivery<IAgentNodeExposedCommand>,
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  catchup(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  subscribe(index?: number): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
};

export const agentNodeOperation = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(error =>
      ensureZerospinError({ code: 'agent-node-operation-failed', error }),
    ),
  );
