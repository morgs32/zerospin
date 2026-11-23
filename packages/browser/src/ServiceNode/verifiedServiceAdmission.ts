import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IDevelopmentHistory } from '@zerospin/core/Node/DevelopmentHistorySchema';
import type {
  IServiceNodeBaseline,
  IServiceNodeDefinition,
  IServiceNodeIdentity,
} from '@zerospin/core/ServiceNode/types';
import type { ISystemEnvironmentId } from '@zerospin/core/system/types';

import type { makeNodeAuthentication } from '../Node/makeNodeAuthentication.ts';

import type { IServiceNodeRequest } from './serviceNodeRequest.ts';

export type IVerifiedServiceAdmission = {
  developmentHistory?: IDevelopmentHistory | undefined;
  environment: ISystemEnvironmentId;
  snapshot?: IServiceNodeBaseline;
  admission: IAdmissionRequest;
  identity: IServiceNodeIdentity;
};
export type IServiceNodeResolution = {
  request: IServiceNodeRequest;
  definition: IServiceNodeDefinition;
  revision: number;
} & ({ online: true; verified: IVerifiedServiceAdmission } | { online: false });
export type IServiceNodeAuthentication = ReturnType<
  typeof makeNodeAuthentication<
    IAdmissionRequest,
    IVerifiedServiceAdmission,
    IVerifiedServiceAdmission
  >
>;
