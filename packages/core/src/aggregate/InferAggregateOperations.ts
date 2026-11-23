import type { IInferModelOperations } from '../contracts/InferModelOperations.ts';
import type { IDeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IAggregateRegistry } from './types.ts';
/** All permitted contract outputs across an aggregate's versions. */
export type IInferAggregateOperations<
  AGGREGATE_REGISTRY extends IAggregateRegistry,
> = {
  [VERSION in IDeclaredKeys<AGGREGATE_REGISTRY> &
    number]: IInferModelOperations<AGGREGATE_REGISTRY[VERSION]['models']>;
}[IDeclaredKeys<AGGREGATE_REGISTRY> & number];
