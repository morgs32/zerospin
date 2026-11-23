import type { ReactNode } from 'react';

import type { Metadata } from 'next';

import { Appearance } from '../components/Appearance';
import '../styles.css';

export const metadata: Metadata = {
  title: {
    default: 'Zerospin — Full stack state management',
    template: '%s | Zerospin',
  },
  description:
    'Build local-first applications with versioned models, contracts, durable state, and reactive browser sessions.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="fragment-appearance" suppressHydrationWarning>
      <body>
        <Appearance>{children}</Appearance>
      </body>
    </html>
  );
}
