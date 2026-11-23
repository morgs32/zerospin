'use client';

import { getErrorDiagnostic } from './errorDiagnostic.js';
import { ErrorPage } from './ErrorPage.js';

export function ZerospinErrorPage(props: {
  error: unknown;
  onRetry: () => void;
  defaultDetailsOpen?: boolean;
}) {
  const { error, onRetry, defaultDetailsOpen = false } = props;
  return (
    <ErrorPage
      diagnostic={getErrorDiagnostic({ error })}
      onRetry={onRetry}
      defaultDetailsOpen={defaultDetailsOpen}
    />
  );
}
