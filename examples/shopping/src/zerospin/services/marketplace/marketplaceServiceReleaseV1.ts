import * as sdk from '@zerospin/sdk';

import { catalogActorV1 } from './actors/catalogActorV1';
import { createProductV1 } from './contracts/createProduct/CreateProductV1';
import { productV1 } from './models/product/ProductV1';

export const marketplaceServiceReleaseV1 = sdk.makeServiceRelease(
  sdk.defineService({ name: 'marketplace' }),
  {
    version: 1,
    models: { product: productV1 },
    actors: { catalog: catalogActorV1 },
    system: { createProduct: createProductV1 },
  },
);
