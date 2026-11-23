import { bindRepoNamespace } from '../makeDORepo/bindRepoNamespace.js';

import { serviceChainNameUtils } from './serviceChainName.js';

export const getServiceChain = bindRepoNamespace(
  serviceChainNameUtils,
  'SERVICE_CHAIN',
);
