import { useSyncExternalStore, type CSSProperties } from 'react';

import type {
  IDevtoolsAggregateSessionEntry,
  IDevtoolsServiceSessionEntry,
} from '../types.js';

import { SessionsDataCell } from './SessionsDataCell';

export function SessionsClaimsCell(props: {
  readonly session: IDevtoolsAggregateSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const text = useSyncExternalStore(
    session.subscribe,
    () =>
      session.getInitialized() === null
        ? 'Initializing...'
        : JSON.stringify(session.getClaims()),
    () =>
      session.getInitialized() === null
        ? 'Initializing...'
        : JSON.stringify(session.getClaims()),
  );

  return (
    <SessionsDataCell text={text} ariaLabel="Copy claims" tdStyle={tdStyle} />
  );
}

export function ServiceSessionsClaimsCell(props: {
  readonly session: IDevtoolsServiceSessionEntry;
  readonly tdStyle: CSSProperties;
}) {
  const { session, tdStyle } = props;

  const text = useSyncExternalStore(
    session.subscribe,
    () =>
      session.getInitialized() !== null
        ? JSON.stringify(session.getClaims())
        : 'Initializing...',
    () =>
      session.getInitialized() !== null
        ? JSON.stringify(session.getClaims())
        : 'Initializing...',
  );

  return (
    <SessionsDataCell text={text} ariaLabel="Copy claims" tdStyle={tdStyle} />
  );
}
