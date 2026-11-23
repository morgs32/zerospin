import type { ReactNode } from 'react';

import { useAuth, useUser } from '@clerk/react';
import { auth } from '@clerk/tanstack-react-start/server';
import {
  createFileRoute,
  Navigate,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { makeZerospinError } from '@zerospin/error';
import {
  SessionProvider,
  SessionReady,
  useConnectedAggregateSession,
  useConnectedServiceSession,
} from '@zerospin/react';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { toast } from 'sonner';

import { PromotionObservationProvider } from '@/components/PromotionReservationStatus';
import { RequiredUserProvider } from '@/components/RequiredUser';
import { signInReturnTo } from '@/signInReturnTo';
import { applicationLayer } from '@/zerospin/applicationLayer';
import catalogWorkerUrl from '@/zerospin/catalog.worker?sharedworker&url';
import { catalogSessionDefinition } from '@/zerospin/catalogSessionDefinition';
import { ClerkUserIdSchema, clerkCredentialsSchema } from '@/zerospin/claims';
import shopperWorkerUrl from '@/zerospin/shopper.worker?sharedworker&url';
import { shopperSessionDefinition } from '@/zerospin/shopperSessionDefinition';

const requireClerkSession = createIsomorphicFn().server(
  async (href: string) => {
    const { userId } = await auth();
    if (userId) return;

    throw redirect({
      to: '/signin/$',
      params: { _splat: '' },
      search: { redirect_url: signInReturnTo(href) },
      headers: { 'Cache-Control': 'private, no-store' },
    });
  },
);

export const Route = createFileRoute('/_app/_authenticated')({
  ssr: 'data-only',
  beforeLoad: ({ location }) => requireClerkSession(location.href),
  component: AuthenticatedRoute,
});

function AuthenticatedRoute() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return null;
  }

  if (!user) {
    return (
      <Navigate
        to="/signin/$"
        params={{ _splat: '' }}
        search={{ redirect_url: undefined }}
        replace
      />
    );
  }

  return (
    <RequiredUserProvider user={user}>
      <ZerospinSessions userId={user.id}>
        <Outlet />
      </ZerospinSessions>
    </RequiredUserProvider>
  );
}

function ZerospinSessions(props: { userId: string; children: ReactNode }) {
  const { userId, children } = props;
  const clerkUserId = Schema.decodeUnknownSync(ClerkUserIdSchema)(userId);
  const { getToken } = useAuth();
  const getCredentials = () =>
    Effect.tryPromise({
      try: () => getToken(),
      catch: () => makeZerospinError('clerk-session-unavailable'),
    }).pipe(
      Effect.flatMap(token =>
        token === null
          ? Effect.fail(makeZerospinError('clerk-session-unavailable'))
          : Effect.succeed({ token }),
      ),
    );

  const shopper = useConnectedAggregateSession(
    shopperSessionDefinition,
    {
      sharedWorkerUrl: shopperWorkerUrl,
      credentialsSchema: clerkCredentialsSchema,
      layer: applicationLayer,
      aggregateId: userId,
      expectedClaims: { clerkUserId, aggregateId: clerkUserId },
      getCredentials,
    },
    { onFailure: error => toast.error(error.message) },
  );
  const catalog = useConnectedServiceSession(
    catalogSessionDefinition,
    {
      sharedWorkerUrl: catalogWorkerUrl,
      credentialsSchema: clerkCredentialsSchema,
      layer: applicationLayer,
      expectedClaims: { clerkUserId },
      getCredentials,
    },
    { onFailure: error => toast.error(error.message) },
  );
  return (
    <SessionProvider session={shopper}>
      <SessionProvider session={catalog}>
        <SessionReady
          definition={shopperSessionDefinition}
          renderError={renderSessionError}
        >
          <SessionReady
            definition={catalogSessionDefinition}
            renderError={renderSessionError}
          >
            <PromotionObservationProvider
              getCredentials={getCredentials}
              renderError={renderSessionError}
            >
              {children}
            </PromotionObservationProvider>
          </SessionReady>
        </SessionReady>
      </SessionProvider>
    </SessionProvider>
  );
}

function renderSessionError(error: unknown) {
  return (
    <section role="alert">
      <h1>404</h1>
      <p>This session is unavailable.</p>
      <pre>{error instanceof Error ? error.message : String(error)}</pre>
    </section>
  );
}
