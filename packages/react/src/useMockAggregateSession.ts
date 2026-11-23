'use client';

import {
  makeMockAggregateSession,
  type IMockAggregateSessionInputs,
} from '@zerospin/browser/makeMockAggregateSession';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IAnyError } from '@zerospin/error';
import type { Layer } from 'effect';

import type {
  ISessionObservers,
  ISessionOptions,
} from './managedSession/types.js';
import { useManagedSession } from './managedSession/useManagedSession.js';

export function useMockAggregateSession<
  const D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
>(
  definition: D,
  options: ISessionOptions<IMockAggregateSessionInputs<D, L>>,
  observers?: ISessionObservers,
) {
  return useManagedSession({
    definition,
    options,
    observers,
    makeSession: inputs =>
      makeMockAggregateSession<D, L>(Object.assign({ definition }, inputs)),
    initialize: session => session.initialize(),
  });
}
