'use client';

import { useCallback } from 'react';

import {
  sessionAttempt,
  type ISessionDefinition,
} from './managedSession/types.js';
import { useSessionBinding } from './SessionProvider.js';

/** Revoke owned authentication even when readiness has withdrawn or the session is disabled. */
export function useClearSessionAuthentication(definition: ISessionDefinition) {
  const session = useSessionBinding(definition);
  const clearAuthentication = session[sessionAttempt].clearAuthentication;
  return useCallback(() => clearAuthentication(), [clearAuthentication]);
}
