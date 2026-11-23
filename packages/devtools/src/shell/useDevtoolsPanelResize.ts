import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { devtoolsStore } from '../store.js';

import type { useDevtoolsVisibility } from './useDevtoolsVisibility.js';

export function useDevtoolsPanelResize(
  panelLocation: 'top' | 'bottom',
  visibility: ReturnType<typeof useDevtoolsVisibility>,
  popup: Window | null,
) {
  const { close, setOpen } = visibility;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const release = useRef<(() => void) | null>(null);
  const mounted = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release.current?.();
      release.current = null;
    };
  }, []);
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [popup],
  );
  const start = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.button !== 0 || panelRef.current === null) return;
      release.current?.();
      const ownerWindow =
        event.currentTarget.ownerDocument.defaultView ?? window;
      const originalHeight = panelRef.current.getBoundingClientRect().height;
      const startPageY = event.pageY;
      let active = true;
      const finish = () => {
        if (!active) return;
        active = false;
        ownerWindow.removeEventListener('mousemove', move);
        ownerWindow.removeEventListener('mouseup', finish);
        if (release.current === finish) release.current = null;
        if (mounted.current) setIsResizing(false);
      };
      const move = (next: MouseEvent) => {
        if (!active || !mounted.current) return;
        const delta = startPageY - next.pageY;
        const nextHeight =
          panelLocation === 'bottom'
            ? originalHeight + delta
            : originalHeight - delta;
        if (!Number.isFinite(nextHeight)) return;
        if (nextHeight < 70) {
          close();
          finish();
          return;
        }
        const height = Math.max(
          70,
          Math.min(nextHeight, Math.max(70, ownerWindow.innerHeight * 0.9)),
        );
        devtoolsStore.setState(state => ({
          state: { ...state.state, height },
        }));
        setOpen(true);
      };
      release.current = finish;
      setIsResizing(true);
      ownerWindow.addEventListener('mousemove', move);
      ownerWindow.addEventListener('mouseup', finish);
    },
    [panelLocation, close, setOpen],
  );
  return { panelRef, isResizing, start };
}
