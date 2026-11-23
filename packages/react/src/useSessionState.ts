'use client';

import type {
  ISessionDefinition,
  ISessionState,
} from './managedSession/types.js';
import { useSessionBinding } from './SessionProvider.js';

/** Observe absence, initialization and terminal errors without acquiring a ready capability. */
export function useSessionState(definition: ISessionDefinition): ISessionState {
  const { isEnabled, isReady, error, retry } = useSessionBinding(definition);
  return { isEnabled, isReady, error, retry };
}
