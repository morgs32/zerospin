import type { ComponentProps } from 'react';

export function StudioCard({ className, ...props }: ComponentProps<'article'>) {
  return (
    <article
      className={['studio-card', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
