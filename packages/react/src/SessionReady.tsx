'use client';

import { Component, Suspense, type ReactNode } from 'react';

import { ensureZerospinError, type IZerospinError } from '@zerospin/error';

import {
  sessionAttempt,
  type IManagedFacade,
  type ISessionDefinition,
} from './managedSession/types.js';
import { useSessionBinding } from './SessionProvider.js';
import { SessionQueryError } from './SessionQueryError.js';

type IReadyBoundaryProps = {
  session: IManagedFacade;
  children: ReactNode;
  retry(): void;
  renderError(error: IZerospinError, retry: () => void): ReactNode;
};
type IReadyBoundaryState = {
  failure: { error: unknown } | null;
};

class ReadyBoundary extends Component<
  IReadyBoundaryProps,
  IReadyBoundaryState
> {
  override state: IReadyBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): IReadyBoundaryState {
    return { failure: { error } };
  }

  override componentDidCatch(error: unknown) {
    if (
      error instanceof SessionQueryError &&
      error.session === this.props.session
    ) {
      this.props.session.reportFailure({
        origin: 'session',
        error: error.error,
      });
    }
  }

  override render() {
    const { failure } = this.state;
    if (failure === null) return this.props.children;
    const { error } = failure;
    if (
      !(error instanceof SessionQueryError) ||
      error.session !== this.props.session
    ) {
      throw error;
    }
    return this.props.renderError(
      ensureZerospinError({ code: 'session-failed', error: error.error }),
      this.props.retry,
    );
  }
}

/** Limit loading, errors and retry remounts to readers of one exact session declaration. */
export function SessionReady(props: {
  definition: ISessionDefinition;
  children: ReactNode;
  fallback?: ReactNode;
  renderError(error: IZerospinError, retry: () => void): ReactNode;
}) {
  const handle = useSessionBinding(props.definition);
  if (!handle.isEnabled) return null;
  if (handle.error !== null) {
    return props.renderError(handle.error, handle.retry);
  }
  if (!handle.isReady || handle.session === null) return props.fallback ?? null;
  return (
    <ReadyBoundary
      key={handle[sessionAttempt].generation}
      session={handle.session}
      retry={handle.retry}
      renderError={props.renderError}
    >
      <Suspense fallback={props.fallback ?? null}>{props.children}</Suspense>
    </ReadyBoundary>
  );
}
