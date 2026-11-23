'use client';

import {
  makeStandaloneAggregateSession,
  type IStandaloneAggregateSessionInputs,
} from '@zerospin/browser/makeStandaloneAggregateSession';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IAnyError } from '@zerospin/error';
import type { Layer } from 'effect';

import type {
  ISessionObservers,
  ISessionOptions,
} from './managedSession/types.js';
import { useManagedSession } from './managedSession/useManagedSession.js';

export function useStandaloneAggregateSession<
  const D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
  const P extends string = string,
>(
  definition: D,
  options: ISessionOptions<IStandaloneAggregateSessionInputs<D, L, P>>,
  observers?: ISessionObservers,
) {
  return useManagedSession({
    definition,
    options,
    observers,
    makeSession: inputs =>
      makeStandaloneAggregateSession<D, L, P>(
        Object.assign({ definition }, inputs),
      ),
    initialize: session => session.initialize(),
  });
}
