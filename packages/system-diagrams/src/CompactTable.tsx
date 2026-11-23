import type { ComponentProps } from 'react';

export function CompactTable({
  className,
  framed = true,
  ...props
}: ComponentProps<'table'> & { framed?: boolean }) {
  return (
    <section
      className="studio-compact-table-scroll"
      data-slot="table-container"
      aria-label={`${props['aria-label'] ?? 'Table'} scroll area`}
      // Keyboard focus enables horizontal scrolling without a pointer.
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table
        data-framed={framed}
        className={['studio-compact-table', className]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
    </section>
  );
}
