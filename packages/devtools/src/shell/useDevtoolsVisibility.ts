import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { devtoolsStore } from '../store.js';
import { zerospinDevtoolsController } from '../zerospinDevtoolsController.js';

import type { useDetachedDevtoolsWindow } from './useDetachedDevtoolsWindow.js';

/** Imperative opening settles after a visible commit, cancellation, or owner disposal. */
export function useDevtoolsVisibility(
  initialOpen: boolean,
  mounted: boolean,
  detached: ReturnType<typeof useDetachedDevtoolsWindow>,
) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const openState = useRef(initialOpen);
  const visible = useRef(false);
  const pending = useRef<ReturnType<typeof Promise.withResolvers<void>> | null>(
    null,
  );
  const setOpen = useCallback(
    (next: boolean) => {
      openState.current = next;
      setIsOpen(next);
      devtoolsStore.setState(state => ({
        state: { ...state.state, persistOpen: next },
      }));
      if (!next && !visible.current && detached.current.current === null) {
        pending.current?.reject(
          new Error(
            'Zerospin DevTools closed before its panel finished opening.',
          ),
        );
        pending.current = null;
      }
    },
    [detached.current],
  );
  const open = useCallback(() => {
    if (
      visible.current &&
      (openState.current || detached.current.current !== null)
    ) {
      return Promise.resolve();
    }
    if (pending.current !== null) return pending.current.promise;
    const request = Promise.withResolvers<void>();
    pending.current = request;
    setOpen(true);
    // A close/reopen in one event retains the committed visible panel.
    if (visible.current) {
      pending.current = null;
      request.resolve();
    }
    return request.promise;
  }, [detached.current, setOpen]);
  useLayoutEffect(() => {
    visible.current = mounted && (isOpen || detached.popup !== null);
    if (visible.current) {
      pending.current?.resolve();
      pending.current = null;
    }
  }, [mounted, isOpen, detached.popup]);
  useLayoutEffect(() => {
    const unregister = zerospinDevtoolsController.registerShell(open);
    return () => {
      unregister();
      visible.current = false;
      pending.current?.reject(
        new Error(
          'Zerospin DevTools unmounted before its panel finished opening.',
        ),
      );
      pending.current = null;
    };
  }, [open]);
  const toggle = useCallback(() => setOpen(!openState.current), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return { isOpen, toggle, close, setOpen };
}
