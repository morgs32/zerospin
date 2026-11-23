import { StrictMode, useEffect } from 'react';

import { ClerkProvider } from '@clerk/react';
import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router';
import { ZerospinErrorPage } from '@zerospin/error-boundary/ZerospinErrorPage';
import { loadDevtools } from '@zerospin/react';
import { Toaster } from 'sonner';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const Route = createFileRoute('/_app')({
  component: ShoppingApp,
  errorComponent: ShoppingErrorPage,
});

function ShoppingApp() {
  const router = useRouter();

  useEffect(() => {
    void loadDevtools();
  }, []);

  if (!clerkPublishableKey) {
    throw new Error('Set VITE_CLERK_PUBLISHABLE_KEY for the shopping app.');
  }

  return (
    <StrictMode>
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInUrl="/signin"
        signUpUrl="/signup"
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        routerPush={href => router.navigate({ href })}
        routerReplace={href => router.navigate({ href, replace: true })}
      >
        <Outlet />
        <Toaster />
      </ClerkProvider>
    </StrictMode>
  );
}

function ShoppingErrorPage({ error }: { error: unknown }) {
  return (
    <ZerospinErrorPage
      error={error}
      onRetry={() => window.location.reload()}
      defaultDetailsOpen={import.meta.env.DEV}
    />
  );
}
