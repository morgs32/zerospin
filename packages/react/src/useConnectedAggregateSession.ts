'use client';

import {
  makeConnectedAggregateSession,
  type IConnectedAggregateSessionInputs,
} from '@zerospin/browser/makeConnectedAggregateSession';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IAnyError } from '@zerospin/error';
import type { Layer, Schema } from 'effect';

import type {
  ISessionObservers,
  ISessionOptions,
} from './managedSession/types.js';
import { useManagedSession } from './managedSession/useManagedSession.js';

export function useConnectedAggregateSession<
  const D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never>,
  const C extends Schema.Codec<unknown, unknown>,
>(
  definition: D,
  options: ISessionOptions<IConnectedAggregateSessionInputs<D, L, C>>,
  observers?: ISessionObservers,
) {
  return useManagedSession({
    definition,
    options,
    observers,
    makeSession: (inputs, readLatest) =>
      makeConnectedAggregateSession<D, L, C>(
        Object.assign({}, inputs, {
          definition,
          getCredentials: () => readLatest().getCredentials(),
        }),
      ),
    initialize: (session, retry) =>
      session.initialize(retry ? { retryConnection: true } : undefined),
  });
}
