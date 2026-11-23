import * as Layer from 'effect/Layer';

import { ShoppingProvidersLive } from '../../ShoppingProvidersLive';
import { ShoppingSystemApiLive } from '../../ShoppingSystemApiLive';

export const userLayer = Layer.mergeAll(
  ShoppingProvidersLive,
  ShoppingSystemApiLive,
);
