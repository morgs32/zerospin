import type { IInferModelOperations } from '../contracts/InferModelOperations.ts';
import type { IDeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IServiceRegistry } from './types.ts';
export type IInferServiceOperations<SERVICE_REGISTRY extends IServiceRegistry> =
  {
    [VERSION in IDeclaredKeys<SERVICE_REGISTRY> &
      number]: IInferModelOperations<SERVICE_REGISTRY[VERSION]['models']>;
  }[IDeclaredKeys<SERVICE_REGISTRY> & number];
