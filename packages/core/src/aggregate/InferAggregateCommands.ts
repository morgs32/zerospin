import type { IInferCommands } from '../contracts/InferCommands.ts';
import type { IDeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IAggregateRegistry } from './types.ts';

/** The command vocabulary across all declared versions of one aggregate. */
export type IInferAggregateCommands<
  AGGREGATE_REGISTRY extends IAggregateRegistry,
> = {
  [VERSION in IDeclaredKeys<AGGREGATE_REGISTRY> & number]: IInferCommands<
    AGGREGATE_REGISTRY[VERSION]['contracts']
  >;
}[IDeclaredKeys<AGGREGATE_REGISTRY> & number];
