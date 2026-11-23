'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { makeZerospinError } from '@zerospin/error';

import type {
  IManagedSession,
  ISessionDefinition,
} from './managedSession/types.js';

type ISessionBinding = {
  readonly session: IManagedSession;
  readonly parent: ISessionBinding | null;
};
const SessionContext = createContext<ISessionBinding | null>(null);

/** Bind an already-owned handle; nested declarations shadow only their exact definition. */
export function SessionProvider(props: {
  session: IManagedSession;
  children: ReactNode;
}) {
  const parent = useContext(SessionContext);
  const value = useMemo(
    () => ({ session: props.session, parent }),
    [props.session, parent],
  );
  return (
    <SessionContext.Provider value={value}>
      {props.children}
    </SessionContext.Provider>
  );
}

export function useSessionBinding(
  definition: ISessionDefinition,
): IManagedSession {
  let binding = useContext(SessionContext);
  while (binding !== null) {
    if (binding.session.definition === definition) return binding.session;
    binding = binding.parent;
  }
  throw makeZerospinError({
    code: 'session-provider-missing',
    message: `Mount a SessionProvider for ${definition.sessionName} before reading its session.`,
  });
}
