'use client';

import {
  makeMockServiceSession,
  type IMockServiceSessionInputs,
} from '@zerospin/browser/makeMockServiceSession';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import type { IAnyError } from '@zerospin/error';
import type { Layer } from 'effect';

import type {
  ISessionObservers,
  ISessionOptions,
} from './managedSession/types.js';
import { useManagedSession } from './managedSession/useManagedSession.js';

export function useMockServiceSession<
  const D extends IServiceSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
>(
  definition: D,
  options: ISessionOptions<IMockServiceSessionInputs<D, L>>,
  observers?: ISessionObservers,
) {
  return useManagedSession({
    definition,
    options,
    observers,
    makeSession: inputs =>
      makeMockServiceSession<D, L>(Object.assign({ definition }, inputs)),
    initialize: session => session.initialize(),
  });
}
