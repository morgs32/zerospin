import NextLink from 'next/link';

import { SiteHeader } from '../components/SiteHeader';

export default function NotFoundPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-width not-found">
        <h1>Page not found</h1>
        <p>This page does not exist.</p>
        <NextLink className="underlined-link" href="/guides/quickstart">
          Read the Zerospin quickstart →
        </NextLink>
      </main>
    </>
  );
}
