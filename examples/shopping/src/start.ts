import { clerkMiddleware } from '@clerk/tanstack-react-start/server';
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start';

const developmentRoutes = createMiddleware().server(({ pathname, next }) => {
  if (!import.meta.env.DEV && /^\/__dev(?:\/|$)/.test(pathname))
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [
    developmentRoutes,
    createCsrfMiddleware({
      filter: context => context.handlerType === 'serverFn',
    }),
    clerkMiddleware({ signInUrl: '/signin', signUpUrl: '/signup' }),
  ],
}));
