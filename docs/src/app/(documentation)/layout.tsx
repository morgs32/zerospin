import type { ReactNode } from 'react';

import { SiteHeader } from '../../components/SiteHeader';
import '../../docs.css';

export default function DocumentationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
