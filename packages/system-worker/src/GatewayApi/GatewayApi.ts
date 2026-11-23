import type { ISystemGatewayRpc } from '@zerospin/core/systemApi/ISystemGatewayRpc';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { aggregate } from './aggregate/aggregate.js';
import { getSystemApi } from './getSystemApi/getSystemApi.js';
import { service } from './service/service.js';

/** An ingress-closed bootstrap exposes only the secret-key System capability. */
export const BootstrapGatewayApi = makeRpcApi('GatewayApi', { getSystemApi });

/** Public root issuing deployment-owned aggregate, service, and system capabilities. */
export class GatewayApi
  extends makeRpcApi('GatewayApi', {
    aggregate,
    service,
    getSystemApi,
  })
  implements ISystemGatewayRpc {}
