import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IInferResource } from '@zerospin/core/models/types';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import type {
  IAggregateSessionReplayRequirements,
  IServiceSessionReplayRequirements,
} from '@zerospin/core/sessionExecution/requirements';
import type { IAnyError } from '@zerospin/error';
import type { Layer } from 'effect';

import type { ISessionRuntimeServices } from '../sessionRuntime.ts';

export type IMockBrowserSessionDefinition =
  | IAggregateSessionDefinition
  | IServiceSessionDefinition;

export type IMockBrowserSessionInputs<
  DEFINITION extends IMockBrowserSessionDefinition,
> = {
  claims: DEFINITION['claimsSchema']['Type'];
  resources?: Partial<{
    [K in keyof DEFINITION['models']]: readonly IInferResource<
      DEFINITION['models'][K]
    >[];
  }>;
};

/** A mock needs application services used by replay, but no connected bootstrap services. */
export type IMockBrowserSessionLayer<
  DEFINITION extends IMockBrowserSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
> = { layer?: L } & ([IMockBrowserSessionRequirements<DEFINITION>] extends [
  never,
]
  ? unknown
  : {
      layer: Layer.Layer<
        IMockBrowserSessionRequirements<DEFINITION>,
        IAnyError,
        never
      >;
    });

type IMockBrowserSessionRequirements<
  DEFINITION extends IMockBrowserSessionDefinition,
> = Exclude<
  DEFINITION extends IAggregateSessionDefinition
    ? IAggregateSessionReplayRequirements<DEFINITION>
    : DEFINITION extends IServiceSessionDefinition
      ? IServiceSessionReplayRequirements<DEFINITION>
      : never,
  ISessionRuntimeServices
>;
