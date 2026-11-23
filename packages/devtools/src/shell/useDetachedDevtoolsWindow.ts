import { useCallback, useEffect, useRef, useState } from 'react';

/** Native acquisition and identity-checked release share one mounted owner. */
export function useDetachedDevtoolsWindow(
  theme: 'light' | 'dark',
  height: number,
) {
  const [popup, setPopup] = useState<Window | null>(null);
  const current = useRef<Window | null>(null);
  const mounted = useRef(false);
  const release = useRef<(() => void) | null>(null);
  useEffect(() => {
    mounted.current = true;
    const unload = () => release.current?.();
    window.addEventListener('beforeunload', unload);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', unload);
      release.current?.();
      release.current = null;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.zerospinDevtoolsTheme = theme;
    if (popup !== null) {
      popup.document.documentElement.dataset.zerospinDevtoolsTheme = theme;
    }
  }, [theme, popup]);
  const open = useCallback(() => {
    if (current.current !== null || !mounted.current) return;
    const next = window.open(
      '',
      'Zerospin-Devtools-Panel',
      `width=${window.innerWidth},height=${Math.min(height, window.innerHeight)},top=${window.screen.height},left=${window.screenLeft},popup`,
    );
    if (next === null) {
      throw new Error(
        'Failed to open popup. Please allow popups for this site to view Zerospin DevTools in picture-in-picture mode.',
      );
    }
    let active = true;
    const close = () => {
      if (!active) return;
      active = false;
      next.removeEventListener('pagehide', close);
      if (current.current === next) {
        current.current = null;
        if (mounted.current) setPopup(null);
      }
      if (release.current === close) release.current = null;
      next.close();
    };
    current.current = next;
    release.current = close;
    next.addEventListener('pagehide', close);
    try {
      next.document.head.innerHTML = '';
      next.document.body.innerHTML = '';
      next.document.title = 'Zerospin DevTools';
      next.document.body.style.margin = '0';
      next.document.documentElement.dataset.zerospinDevtoolsTheme = theme;
      for (const styleSheet of document.styleSheets) {
        try {
          const style = next.document.createElement('style');
          style.textContent = [...styleSheet.cssRules]
            .map(rule => rule.cssText)
            .join('');
          next.document.head.appendChild(style);
        } catch {
          if (styleSheet.href === null) continue;
          const link = next.document.createElement('link');
          link.rel = 'stylesheet';
          link.type = styleSheet.type;
          link.media = styleSheet.media.toString();
          link.href = styleSheet.href;
          next.document.head.appendChild(link);
        }
      }
      setPopup(next);
    } catch (error) {
      close();
      throw error;
    }
  }, [theme, height]);
  return { popup, current, open };
}
