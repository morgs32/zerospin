import { makeServiceSessionDefinition } from '@zerospin/browser';

import { userClaims } from './claims';
import { productV1 } from './services/marketplace/models/product/ProductV1';

export const catalogSessionDefinition = makeServiceSessionDefinition({
  systemName: 'shopping',
  claimsSchema: userClaims,
  actorName: 'catalog',
  actorVersion: 1,
  serviceVersion: 1,
  serviceName: 'marketplace',
  sessionName: 'catalogSession',
  models: { product: productV1 },
});
