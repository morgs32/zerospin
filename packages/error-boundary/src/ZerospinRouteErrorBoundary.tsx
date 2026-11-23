'use client';

import { getBackendTrace } from '@zerospin/error';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import {
  getErrorDiagnostic,
  type IErrorDiagnostic,
} from './errorDiagnostic.js';
import { ErrorPage } from './ErrorPage.js';

export function ZerospinRouteErrorBoundary() {
  const error = useRouteError();
  const diagnostic: IErrorDiagnostic = isRouteErrorResponse(error)
    ? {
        errorKind: 'RouteErrorResponse',
        errorCode: `${String(error.status)} ${error.statusText}`.trim(),
        message:
          typeof error.data === 'string'
            ? error.data
            : error.data instanceof Error
              ? error.data.message
              : 'React Router returned an error response.',
        status: error.status,
        structuredDetailsLabel: error.data === null ? null : 'Response data',
        structuredDetails: error.data,
        cause: null,
        stack: null,
        diagnostics: {
          tag: 'RouteErrorResponse',
          status: error.status,
          statusText: error.statusText,
          data: error.data,
        },
        backendTrace: getBackendTrace(error.data),
        digest: null,
      }
    : getErrorDiagnostic({ error });
  return (
    <ErrorPage
      diagnostic={diagnostic}
      onRetry={() => window.location.reload()}
      defaultDetailsOpen={import.meta.env.DEV}
      retryLabel="Reload application"
    />
  );
}
