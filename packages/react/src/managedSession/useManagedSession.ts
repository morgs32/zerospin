'use client';

import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { makeManagedSession } from './makeManagedSession.js';
import { captureSessionInputs } from './sessionInputs.js';
import {
  sessionAttempt,
  type IManagedFacade,
  type IManagedSession,
  type ISessionObservers,
  type ISessionOptions,
} from './types.js';

export function useManagedSession<
  INPUTS extends object,
  SESSION extends IManagedFacade,
>(props: {
  definition: SESSION['sessionDefinition'];
  options: ISessionOptions<INPUTS>;
  makeSession(inputs: INPUTS, readLatest: () => INPUTS): SESSION;
  initialize(session: SESSION, retry: boolean): Promise<void>;
  observers: ISessionObservers | undefined;
}): IManagedSession<SESSION> {
  const {
    definition,
    options: suppliedOptions,
    makeSession,
    initialize,
    observers,
  } = props;
  const options =
    typeof suppliedOptions === 'function' ? suppliedOptions() : suppliedOptions;
  const inputs = options || null;
  const selection =
    inputs === null ? null : captureSessionInputs({ ...inputs, definition });
  const [owner] = useState(() =>
    makeManagedSession<INPUTS, SESSION>(definition),
  );
  const snapshot = useSyncExternalStore(
    owner.subscribe,
    owner.getSnapshot,
    owner.getSnapshot,
  );
  useLayoutEffect(() => {
    owner.mount();
    return () => owner.unmount();
  }, [owner]);
  useLayoutEffect(() => {
    owner.commit({
      definition,
      inputs,
      makeSession,
      initialize,
      ...(observers === undefined ? {} : { observers }),
    });
  });
  // Requested identity changes hide the previous capability before any effects commit.
  return owner.matches(selection) && snapshot.definition === definition
    ? snapshot
    : {
        definition,
        isEnabled: inputs !== null,
        isReady: false,
        error: null,
        retry: () => {},
        session: null,
        [sessionAttempt]: {
          session: null,
          generation: snapshot[sessionAttempt].generation + 1,
          clearAuthentication: snapshot[sessionAttempt].clearAuthentication,
        },
      };
}
