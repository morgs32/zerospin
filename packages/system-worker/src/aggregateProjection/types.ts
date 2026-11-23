import type { IAggregateExposedCommand } from '@zerospin/core/aggregateSession/types';
import type { ICommandResolution } from '@zerospin/core/contracts/CommandResolutionSchema';
import type { IAgentOrigin } from '@zerospin/core/contracts/OriginSchema';
import type { IErrorJson, IZerospinError } from '@zerospin/error';
import type { Effect } from 'effect';

import type { IEvaluatedAggregateCommand } from '../AggregateVersionChain/evaluatedAggregateCommand.js';
import type { IFanoutEnrollmentError } from '../makeFanoutQueue/makeFanoutQueue.js';
import type { IFanoutSubscriberCapability } from '../makeFanoutSubscriber/makeFanoutSubscriber.js';

import type { applyEvaluatedCommands } from './applyEvaluatedCommands/applyEvaluatedCommands.js';

export type IAggregateProjectionSubscriber = IFanoutSubscriberCapability<
  'actorVersionChainFanout' | 'agentVersionChainFanout',
  IEvaluatedAggregateCommand,
  Effect.Error<ReturnType<typeof applyEvaluatedCommands>>,
  IZerospinError<'repo-key-encode-failed'>,
  IErrorJson<IZerospinError<'fanout-page-invalid'>>,
  IErrorJson<IFanoutEnrollmentError>
>;

/** Already retained selected output, published to live connections after commit. */
export type IAggregateProjectionBroadcast = Readonly<{
  output: IAggregateExposedCommand;
  commandResolution: ICommandResolution | null;
}>;

/** Authenticated snapshot request against one exact Actor projection. */
export type IAggregateActorProjectionSnapshotRequest = {
  aggregateId: string;
  aggregateName: string;
  actorName: string;
  actorVersion: number;
  claims: Readonly<Record<string, unknown>>;
  sessionName: string;
  nodeId: string | null;
};

/** Authenticated snapshot request against one exact Agent projection. */
export type IAggregateAgentProjectionSnapshotRequest = {
  aggregateId: string;
  aggregateName: string;
  origin: IAgentOrigin;
  sessionName: string;
  nodeId: string | null;
};
