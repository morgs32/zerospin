import { env } from 'cloudflare:workers';

import { bindReleaseRepoNamespace } from '../ownerOperations/bindReleaseRepoNamespace.js';

import { serviceVersionRepoNameUtils } from './serviceVersionRepoName.js';

/** Find the materialization in the exact release Worker or colocated namespace. */
export const getServiceVersionRepo = bindReleaseRepoNamespace(
  serviceVersionRepoNameUtils,
  'SERVICE_VERSION_REPO',
  (worker, key) => worker.getServiceVersionRepo(key),
  key => env.ZEROSPIN_HOSTED_SERVICE_DISPATCH?.getServiceVersionRepo(key),
);
