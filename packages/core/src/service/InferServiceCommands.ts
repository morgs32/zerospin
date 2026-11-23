import type { IInferCommands } from '../contracts/InferCommands.ts';
import type { IDeclaredKeys } from '../utils/DeclaredKeys.ts';

import type { IServiceRegistry } from './types.ts';

/** The command vocabulary across all declared versions of one service. */
export type IInferServiceCommands<SERVICE_REGISTRY extends IServiceRegistry> = {
  [VERSION in IDeclaredKeys<SERVICE_REGISTRY> & number]: IInferCommands<
    SERVICE_REGISTRY[VERSION]['contracts']
  >;
}[IDeclaredKeys<SERVICE_REGISTRY> & number];
