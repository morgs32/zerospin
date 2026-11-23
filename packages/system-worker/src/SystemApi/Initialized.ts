import type { ISystemId } from '@zerospin/core/system/types';
import * as Context from 'effect/Context';

/** Deployment identity retained by one admitted system capability. */
export class Initialized extends Context.Service<
  Initialized,
  { readonly systemId: ISystemId }
>()('SystemApi.Initialized') {}
