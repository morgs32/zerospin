import type { CSSProperties } from 'react';

import { NavLink, Outlet } from 'react-router';
import { useStore } from 'zustand/react';

import { devtoolsStore } from '../store.js';
import { tokens } from '../styles/tokens.js';

export function DevtoolsNavigation(props: {
  isDetached: boolean;
  onClose: () => void;
  onDetach: () => void;
}) {
  const { isDetached, onClose, onDetach } = props;
  const settings = useStore(devtoolsStore, state => state.settings);
  const isDark = settings.theme === 'dark';
  const foreground = isDark ? tokens.colors.gray[300] : tokens.colors.gray[600];
  const activeForeground = isDark
    ? tokens.colors.gray[100]
    : tokens.colors.gray[900];
  const activeBackground = isDark
    ? tokens.colors.gray[800]
    : tokens.colors.gray[100];
  const borderColor = isDark
    ? tokens.colors.gray[800]
    : tokens.colors.gray[200];

  const textNavigationStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: 32,
    padding: '0 12px',
    boxSizing: 'border-box',
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    color: foreground,
    backgroundColor: 'transparent',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 11,
    fontWeight: 600,
    textDecoration: 'none',
  };

  const iconControlStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    flexShrink: 0,
    padding: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 0,
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    color: foreground,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      <header
        data-testid="zerospin-devtools-toolbar"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          height: 32,
          flexShrink: 0,
          borderBottomWidth: 1,
          borderBottomStyle: 'solid',
          borderBottomColor: borderColor,
          backgroundColor: isDark
            ? tokens.colors.darkGray[900]
            : tokens.colors.gray[50],
        }}
      >
        <nav aria-label="Zerospin DevTools" style={{ display: 'flex' }}>
          <NavLink
            to="/sessions"
            style={({ isActive }) => ({
              ...textNavigationStyle,
              ...(isActive
                ? {
                    color: activeForeground,
                    backgroundColor: activeBackground,
                    borderBottomColor: activeForeground,
                  }
                : {}),
            })}
          >
            Sessions
          </NavLink>
        </nav>

        <div
          data-testid="zerospin-devtools-native-controls"
          style={{ display: 'flex', marginLeft: 'auto' }}
        >
          <NavLink
            to="/settings"
            aria-label="Settings"
            data-testid="zerospin-devtools-settings"
            style={({ isActive }) => ({
              ...iconControlStyle,
              ...(isActive
                ? {
                    color: activeForeground,
                    backgroundColor: activeBackground,
                    borderBottomColor: activeForeground,
                  }
                : {}),
            })}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
              <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M12 2v2" />
              <path d="M12 22v-2" />
              <path d="m17 20.66-1-1.73" />
              <path d="M11 10.27 7 3.34" />
              <path d="m20.66 17-1.73-1" />
              <path d="m3.34 7 1.73 1" />
              <path d="M14 12h8" />
              <path d="M2 12h2" />
              <path d="m20.66 7-1.73 1" />
              <path d="m3.34 17 1.73-1" />
              <path d="m17 3.34-1 1.73" />
              <path d="m11 13.73-4 6.93" />
            </svg>
          </NavLink>

          {isDetached ? null : (
            <button
              type="button"
              aria-label="Open DevTools in a separate window"
              data-testid="zerospin-devtools-pip"
              style={iconControlStyle}
              onClick={onDetach}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2 10h6V4" />
                <path d="m2 4 6 6" />
                <path d="M21 10V7a2 2 0 0 0-2-2h-7" />
                <path d="M3 14v2a2 2 0 0 0 2 2h3" />
                <rect x="12" y="14" width="10" height="7" rx="1" />
              </svg>
            </button>
          )}

          {isDetached ? null : (
            <button
              type="button"
              aria-label="Close Zerospin DevTools"
              data-testid="zerospin-devtools-close"
              style={iconControlStyle}
              onClick={onClose}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
}
