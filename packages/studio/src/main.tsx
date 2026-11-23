import type { ReactNode } from 'react';

import { createFromReadableStream } from '@vitejs/plugin-rsc/browser';
import { createRoot } from 'react-dom/client';

async function mountStudio() {
  const rscUrl = new URL('/index.rsc', window.location.href);
  rscUrl.searchParams.set('pathname', window.location.pathname);
  const response = await fetch(rscUrl);
  if (!response.ok || !response.body) {
    throw new Error('Could not load Zerospin Declaration Board.');
  }
  const root = await createFromReadableStream<ReactNode>(response.body);
  createRoot(document).render(root);
}

void mountStudio();
