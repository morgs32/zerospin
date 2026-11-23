import { createFileRoute } from '@tanstack/react-router';

async function developmentSignIn(props: {
  request: Request;
  params: { email: string };
}) {
  const { request, params } = props;
  if (!import.meta.env.DEV || process.env.NODE_ENV === 'production')
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  const { handleDevelopmentSignIn } =
    await import('../dev/handleDevelopmentSignIn');
  return handleDevelopmentSignIn(request, params.email);
}

export const Route = createFileRoute('/__dev/log-me-in/$email')({
  server: { handlers: { GET: developmentSignIn, POST: developmentSignIn } },
});
