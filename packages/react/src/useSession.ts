'use client';

import type { IBrowserSession } from '@zerospin/browser/browserSession/types';
import type { ISessionRuntimeServices } from '@zerospin/browser/sessionRuntime';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IServiceSessionDefinition } from '@zerospin/core/serviceSession/types';
import type {
  IAggregateSessionReplayRequirements,
  IServiceSessionReplayRequirements,
} from '@zerospin/core/sessionExecution/requirements';
import { makeZerospinError } from '@zerospin/error';

import {
  sessionAttempt,
  type IManagedFacade,
  type ISessionDefinition,
} from './managedSession/types.js';
import { useSessionBinding } from './SessionProvider.js';
import { SessionQueryError } from './SessionQueryError.js';

export type ISessionServices<D extends ISessionDefinition> =
  | ISessionRuntimeServices
  | (D extends IAggregateSessionDefinition
      ? IAggregateSessionReplayRequirements<D>
      : D extends IServiceSessionDefinition
        ? IServiceSessionReplayRequirements<D>
        : never);

/** Exact declaration identity recovers the session capability erased by heterogeneous context. */
function hasDefinition<D extends ISessionDefinition>(
  session: IManagedFacade,
  definition: D,
): session is IManagedFacade & IBrowserSession<D, ISessionServices<D>> {
  return session.sessionDefinition === definition;
}

/** Ready readers are synchronous; mount them inside the matching SessionReady gate. */
export function useSession<const D extends ISessionDefinition>(
  definition: D,
): IBrowserSession<D, ISessionServices<D>> {
  const handle = useSessionBinding(definition);
  const session = handle.session;
  if (
    handle.isReady &&
    session !== null &&
    hasDefinition(session, definition)
  ) {
    return session;
  }
  const error =
    handle.error ??
    makeZerospinError({
      code: 'session-not-initialized',
      message: `Read ${definition.sessionName} inside its SessionReady gate.`,
    });
  const current = handle[sessionAttempt].session;
  if (current !== null) throw new SessionQueryError(current, error);
  throw error;
}
