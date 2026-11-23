'use client';

import {
  makeConnectedServiceSession,
  type IConnectedServiceSessionInputs,
} from '@zerospin/browser/makeConnectedServiceSession';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import type { Layer, Schema } from 'effect';

import type {
  ISessionObservers,
  ISessionOptions,
} from './managedSession/types.js';
import { useManagedSession } from './managedSession/useManagedSession.js';

export function useConnectedServiceSession<
  const D extends IServiceSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never>,
  const C extends Schema.Codec<unknown, unknown> | undefined = undefined,
>(
  definition: D,
  options: ISessionOptions<IConnectedServiceSessionInputs<D, L, C>>,
  observers?: ISessionObservers,
) {
  return useManagedSession({
    definition,
    options,
    observers,
    makeSession: (inputs, readLatest) =>
      makeConnectedServiceSession<D, L, C>(
        Object.assign({}, inputs, {
          definition,
          ...(inputs.getCredentials === undefined
            ? {}
            : {
                getCredentials: () => {
                  const latest = readLatest();
                  if (latest.getCredentials === undefined) {
                    throw makeZerospinError('session-credentials-required');
                  }
                  return latest.getCredentials();
                },
              }),
        }),
      ),
    initialize: (session, retry) =>
      session.initialize(retry ? { retryConnection: true } : undefined),
  });
}
