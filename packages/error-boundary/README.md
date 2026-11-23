# Zerospin error UI

`ZerospinErrorPage` displays errors without requiring a router, application
providers, or global CSS. The host supplies its recovery action.

```tsx
'use client';

import { ZerospinErrorPage } from '@zerospin/error-boundary/ZerospinErrorPage';

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { error, retry } = props;
  return <ZerospinErrorPage error={error} onRetry={retry} />;
}
```

`defaultDetailsOpen` defaults to `false`. Pass `true` to initially expand the
diagnostic details. Available backend traces display their trace and span
identifiers; the reference does not promise provider delivery or indexing.
Available Next.js digests are displayed and included in copied diagnostics;
redacted server errors remain redacted.

Next.js `global-error.tsx` can render the same page inside its own `<html>` and
`<body>`. The error page does not read initialized-session hooks.

React Router applications retain
`@zerospin/error-boundary/ZerospinRouteErrorBoundary` as their route error
handler. This adapter reads the route error, preserves response status and
payload, and reloads the application when requested. Its React Router peer is
optional for applications using only the neutral error page.
