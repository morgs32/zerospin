import { ensureZerospinError, makeZerospinError } from '@zerospin/error';

import { captureSessionInputs, sessionInputsEqual } from './sessionInputs.js';
import {
  sessionAttempt,
  type IManagedFacade,
  type IManagedSession,
  type ISessionObservers,
} from './types.js';

let nextAttempt = 0;

/** Own committed facade generations independently of the descendants consuming them. */
export function makeManagedSession<
  INPUTS extends object,
  SESSION extends IManagedFacade,
>(initialDefinition: SESSION['sessionDefinition']) {
  let definition = initialDefinition;
  let generation = 0;
  let mounted = false;
  let committed = false;
  let inputs: INPUTS | null = null;
  let selection: object | null = null;
  let observers: ISessionObservers | undefined;
  let construct:
    | ((inputs: INPUTS, readLatest: () => INPUTS) => SESSION)
    | undefined;
  let initialize:
    | ((session: SESSION, retry: boolean) => Promise<void>)
    | undefined;
  let active: {
    session: SESSION;
    updateInputs(inputs: INPUTS): void;
    unsubscribe(): void;
  } | null = null;
  let closing: Promise<void> | undefined;
  let authenticationCleared = false;
  let authenticationSupported: boolean | undefined;
  const authenticationClearers = new Set<() => Promise<void>>();
  const clearAuthentication = async () => {
    authenticationCleared = true;
    if (
      authenticationSupported === false &&
      authenticationClearers.size === 0
    ) {
      throw makeZerospinError('standalone-authentication-unsupported');
    }
    await Promise.all(
      [...authenticationClearers].map(async clear => {
        await clear();
        authenticationClearers.delete(clear);
      }),
    );
  };
  const listeners = new Set<() => void>();
  let snapshot: IManagedSession<SESSION> = {
    definition,
    isEnabled: false,
    isReady: false,
    error: null,
    session: null,
    retry: () => {},
    [sessionAttempt]: { session: null, generation, clearAuthentication },
  };
  const publish = (next: IManagedSession<SESSION>) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const detach = () => {
    const previous = active;
    active = null;
    if (previous === null) return;
    previous.unsubscribe();
    try {
      const disposal = previous.session.dispose();
      // A failed facade reports cleanup defects itself; cleanup cannot strand replacement.
      closing = Promise.all([closing, disposal]).then(
        () => undefined,
        () => undefined,
      );
    } catch {
      closing = Promise.resolve();
    }
  };
  const replace = (retry: boolean) => {
    const attempt = ++nextAttempt;
    generation = attempt;
    detach();
    const enabled = inputs !== null;
    const retryAttempt = () => {
      if (
        !authenticationCleared &&
        mounted &&
        generation === attempt &&
        snapshot.error !== null
      ) {
        replace(true);
      }
    };
    publish({
      definition,
      isEnabled: enabled,
      isReady: false,
      error: null,
      session: null,
      retry: retryAttempt,
      [sessionAttempt]: {
        session: null,
        generation: attempt,
        clearAuthentication,
      },
    });
    if (!enabled) return;
    const start = () => {
      if (
        !mounted ||
        authenticationCleared ||
        generation !== attempt ||
        inputs === null ||
        construct === undefined ||
        initialize === undefined
      ) {
        return;
      }
      let latest = inputs;
      try {
        const session = construct(inputs, () => latest);
        authenticationSupported =
          typeof session.clearAuthentication === 'function';
        if (session.clearAuthentication !== undefined) {
          authenticationClearers.add(session.clearAuthentication.bind(session));
        }
        const owner = {
          session,
          updateInputs: (value: INPUTS) => {
            latest = value;
          },
          unsubscribe: () => {},
        };
        active = owner;
        let previousFailure = session.store.getState().failure;
        const observe = () => {
          if (!mounted || generation !== attempt || active !== owner) return;
          const state = session.store.getState();
          const isReady =
            state.status === 'ready' && state.initialized !== null;
          const error = state.status === 'failed' ? state.failure : null;
          if (
            snapshot.isReady !== isReady ||
            snapshot.error !== error ||
            snapshot[sessionAttempt].session !== session
          ) {
            publish({
              definition,
              isEnabled: true,
              isReady,
              error,
              session: isReady ? session : null,
              retry: retryAttempt,
              [sessionAttempt]: {
                session,
                generation: attempt,
                clearAuthentication,
              },
            });
          }
          if (state.failure !== previousFailure) {
            previousFailure = state.failure;
            if (
              generation === attempt &&
              active === owner &&
              state.status !== 'failed' &&
              state.failure !== null
            ) {
              observers?.onFailure?.(state.failure);
            }
          }
        };
        owner.unsubscribe = session.store.subscribe(observe);
        observe();
        if (session.store.getState().status !== 'failed') {
          void initialize(session, retry).catch(error => {
            if (mounted && generation === attempt && active === owner) {
              session.reportFailure({ origin: 'session', error });
            }
          });
        }
      } catch (error) {
        if (generation !== attempt || !mounted) return;
        if (active !== null) {
          active.session.reportFailure({ origin: 'session', error });
        } else {
          publish({
            ...snapshot,
            error: ensureZerospinError({ code: 'session-failed', error }),
          });
        }
      }
    };
    if (closing === undefined) {
      start();
    } else {
      const cleanup = closing;
      void cleanup.then(() => {
        if (closing === cleanup) closing = undefined;
        start();
      });
    }
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    matches(next: object | null) {
      return sessionInputsEqual(selection, next);
    },
    mount() {
      mounted = true;
    },
    unmount() {
      mounted = false;
      generation = ++nextAttempt;
      detach();
      selection = null;
      inputs = null;
      committed = false;
    },
    commit(props: {
      definition: SESSION['sessionDefinition'];
      inputs: INPUTS | null;
      makeSession(inputs: INPUTS, readLatest: () => INPUTS): SESSION;
      initialize(session: SESSION, retry: boolean): Promise<void>;
      observers?: ISessionObservers;
    }) {
      const {
        definition: nextDefinition,
        inputs: nextInputs,
        makeSession,
        initialize: initializeSession,
        observers: nextObservers,
      } = props;
      observers = nextObservers;
      construct = makeSession;
      initialize = initializeSession;
      const next =
        nextInputs === null
          ? null
          : captureSessionInputs({
              ...nextInputs,
              definition: nextDefinition,
            });
      const changed =
        definition !== nextDefinition || !sessionInputsEqual(selection, next);
      inputs = nextInputs;
      if (committed && !changed) {
        if (active !== null && inputs !== null) active.updateInputs(inputs);
        return;
      }
      committed = true;
      definition = nextDefinition;
      selection = next;
      authenticationCleared = false;
      replace(false);
    },
  };
}
