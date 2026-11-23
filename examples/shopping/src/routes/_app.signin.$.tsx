import { useEffect } from 'react';

import { SignIn, useAuth } from '@clerk/react';
import { createFileRoute, useRouter } from '@tanstack/react-router';

import { signInReturnTo } from '@/signInReturnTo';

export const Route = createFileRoute('/_app/signin/$')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect_url:
      search.redirect_url === undefined
        ? undefined
        : signInReturnTo(search.redirect_url),
  }),
  component: SignInRoute,
});

function SignInRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  const { redirect_url: returnTo } = Route.useSearch();

  const router = useRouter();
  useEffect(() => {
    if (isSignedIn)
      void router.navigate({ href: returnTo ?? '/', replace: true });
  }, [isSignedIn, returnTo, router]);

  if (!isLoaded || isSignedIn) return null;

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center px-6 py-12">
      <SignIn path="/signin" routing="path" signUpUrl="/signup" />
    </div>
  );
}
