import NextLink from 'next/link';

import { HeaderNavigation } from './HeaderNavigation';
import { Wordmark } from './Wordmark';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="page-width header-inner">
        <NextLink className="wordmark" href="/" aria-label="ZEROSPIN homepage">
          <Wordmark />
        </NextLink>
        <HeaderNavigation />
      </div>
    </header>
  );
}
