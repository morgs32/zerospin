import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';

import '../styles.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Zerospin Shopping' },
    ],
    links: [{ rel: 'icon', href: '/icon.svg' }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
