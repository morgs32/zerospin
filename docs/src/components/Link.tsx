import type { ComponentProps } from 'react';

import NextLink from 'next/link';

type ILinkProps = ComponentProps<'a'> & {
  underlined?: boolean;
  withIcon?: boolean;
};

export function Link({
  className,
  children,
  underlined = true,
  withIcon = false,
  ...props
}: ILinkProps) {
  const classes = [underlined && 'underlined-link', className]
    .filter(Boolean)
    .join(' ');

  return (
    <NextLink
      {...props}
      href={props.href ?? '#'}
      className={classes || undefined}
    >
      {children}
      {withIcon && (
        <>
          {' '}
          <span aria-hidden="true">
            {/^https?:/i.test(props.href ?? '') ? '↗' : '→'}
          </span>
        </>
      )}
    </NextLink>
  );
}
