import type {
  IAggregateNodeBaseline,
  IAggregateNodeDefinition,
  IAggregateNodeIdentity,
} from '@zerospin/core/AggregateNode/types';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import type { IDevelopmentHistory } from '@zerospin/core/Node/DevelopmentHistorySchema';
import type { ISystemEnvironmentId } from '@zerospin/core/system/types';

import type { makeNodeAuthentication } from '../Node/makeNodeAuthentication.ts';

import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';

/** Internal proof produced by this attachment's SharedWorker discovery. */
export type IAggregateNodeResolution = {
  request: IAggregateNodeRequest;
  definition: IAggregateNodeDefinition;
  revision: number;
} & (
  | { online: true; verified: IVerifiedAggregateAdmission }
  | { online: false }
);

export type IVerifiedAggregateAdmission = {
  developmentHistory?: IDevelopmentHistory | undefined;
  environment: ISystemEnvironmentId;
  snapshot?: IAggregateNodeBaseline;
  getAdmission(): Promise<IAggregateAuthenticationRequest>;
  identity: IAggregateNodeIdentity;
};
export type IAggregateNodeAuthentication = ReturnType<
  typeof makeNodeAuthentication<
    IAggregateAuthenticationRequest,
    Omit<IVerifiedAggregateAdmission, 'getAdmission'>,
    IVerifiedAggregateAdmission
  >
>;
