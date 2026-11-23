import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';

import type { IInitializedAggregateSession } from './makeInitializedAggregateSession.ts';

export const getInitializedSessionOrThrow = Effect.fn(
  'getInitializedSessionOrThrow',
)(function* <INITIALIZED extends IInitializedAggregateSession>(props: {
  session: {
    store: {
      getState(): {
        initialized: INITIALIZED | null;
      };
    };
  };
}) {
  const { session } = props;

  const initialized = session.store.getState().initialized;
  if (initialized === null) {
    return yield* makeZerospinError('aggregate-session-not-ready');
  }
  return initialized;
});
