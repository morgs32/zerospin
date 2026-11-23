// Adapted from shadcn/ui's Base UI Dropdown Menu (MIT):
// https://ui.shadcn.com/docs/components/base/dropdown-menu
// Uses the site's CSS theme instead of Tailwind utilities.
import { Menu } from '@base-ui/react/menu';

import './dropdown-menu.css';

export function DropdownMenu(
  props: Menu.Root.Props & { children: React.ReactNode },
) {
  const { children, ...rootProps } = props;
  return <Menu.Root {...rootProps}>{children}</Menu.Root>;
}

export function DropdownMenuTrigger(props: Menu.Trigger.Props) {
  const { children, ...triggerProps } = props;
  return (
    <Menu.Trigger data-slot="dropdown-menu-trigger" {...triggerProps}>
      {children}
    </Menu.Trigger>
  );
}

export function DropdownMenuContent(
  props: Menu.Popup.Props &
    Pick<Menu.Positioner.Props, 'align' | 'sideOffset' | 'collisionPadding'>,
) {
  const {
    className,
    align,
    sideOffset = 4,
    collisionPadding,
    ...popupProps
  } = props;
  return (
    <Menu.Portal>
      <Menu.Positioner
        className="dropdown-menu-positioner"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
      >
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className={state =>
            `dropdown-menu-content ${(typeof className === 'function' ? className(state) : className) ?? ''}`
          }
          {...popupProps}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuItem(props: Menu.LinkItem.Props) {
  const { className, ...itemProps } = props;
  return (
    <Menu.LinkItem
      data-slot="dropdown-menu-item"
      closeOnClick
      className={state =>
        `dropdown-menu-item ${(typeof className === 'function' ? className(state) : className) ?? ''}`
      }
      {...itemProps}
    />
  );
}
