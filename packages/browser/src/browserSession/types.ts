import type { RoutePattern } from '@remix-run/route-pattern';
import type { CreateHrefArgs } from '@remix-run/route-pattern/href';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import type { IClaimsSchema } from '@zerospin/core/identity/types';
import type { IAnyModels, IInferResource } from '@zerospin/core/models/types';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import type { ITypeError } from '@zerospin/shapes';

import type { ISessionRuntimeServices } from '../sessionRuntime.ts';

export type IStandaloneSessionInitialization<
  C extends IClaimsSchema,
  M extends IAnyModels,
  P extends string,
> = {
  claims: C['Type'];
  backupPath: RoutePattern<P> &
    (C['Type'] extends NonNullable<CreateHrefArgs<P>[0]>
      ? unknown
      : ITypeError<'Backup path parameters must be string or number fields in the claims schema'>);
  resources?: Partial<{ [K in keyof M]: readonly IInferResource<M[K]>[] }>;
};
/** A portable UI facade contains no transport configuration. */
export type IBrowserSession<
  D extends IAggregateSessionDefinition | IServiceSessionDefinition,
  SERVICES = ISessionRuntimeServices,
> = (D extends IServiceSessionDefinition
  ? IServiceSession<D, D['models'], SERVICES>
  : D extends IAggregateSessionDefinition
    ? IAggregateSession<D, SERVICES>
    : never) & {
  readonly systemName: D['systemName'];
  readonly claimsSchema: D['claimsSchema'];
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};

export type IBrowserSessionInitializeOptions = { retryConnection?: true };
