import { useState, type CSSProperties } from 'react';

import { createPortal } from 'react-dom';
import { MemoryRouter } from 'react-router';

import triggerLogo from '../components/triggerLogo.js';
import { tokens } from '../styles/tokens.js';
import type { IDevtoolsStore, IZerospinDevtoolsConfig } from '../types.js';
import { ZEROSPIN_DEVTOOLS } from '../utils/storage.js';

import { DevtoolsRoutes } from './DevtoolsRoutes.js';
import type { useDetachedDevtoolsWindow } from './useDetachedDevtoolsWindow.js';
import type { useDevtoolsPanelResize } from './useDevtoolsPanelResize.js';
import type { useDevtoolsVisibility } from './useDevtoolsVisibility.js';

export function DevtoolsFrame({
  settings,
  configuredTheme,
  height,
  visibility,
  resize,
  detached,
}: {
  settings: IDevtoolsStore['settings'];
  configuredTheme: IZerospinDevtoolsConfig['theme'];
  height: number;
  visibility: ReturnType<typeof useDevtoolsVisibility>;
  resize: ReturnType<typeof useDevtoolsPanelResize>;
  detached: ReturnType<typeof useDetachedDevtoolsWindow>;
}) {
  const [isTriggerHovered, setIsTriggerHovered] = useState(false);
  const { isOpen, toggle: toggleOpen } = visibility;
  const { isResizing, panelRef, start: handleDragStart } = resize;
  const { popup: pipWindow, open: requestPipWindow } = detached;
  const isDark = settings.theme === 'dark';
  const portalTarget = pipWindow?.document.body ?? document.body;

  const triggerPositionStyle: CSSProperties = {};
  if (settings.position === 'top-left') {
    triggerPositionStyle.top = 16;
    triggerPositionStyle.left = 16;
  }
  if (settings.position === 'top-right') {
    triggerPositionStyle.top = 16;
    triggerPositionStyle.right = 16;
  }
  if (settings.position === 'middle-left') {
    triggerPositionStyle.top = '50%';
    triggerPositionStyle.left = 16;
    triggerPositionStyle.transform = 'translateY(-50%)';
  }
  if (settings.position === 'middle-right') {
    triggerPositionStyle.top = '50%';
    triggerPositionStyle.right = 16;
    triggerPositionStyle.transform = 'translateY(-50%)';
  }
  if (settings.position === 'bottom-left') {
    triggerPositionStyle.bottom = 16;
    triggerPositionStyle.left = 16;
  }
  if (settings.position === 'bottom-right') {
    triggerPositionStyle.bottom = 16;
    triggerPositionStyle.right = 16;
  }

  const panelPositionStyle: CSSProperties = {};
  if (settings.panelLocation === 'top') {
    panelPositionStyle.top = 0;
  } else {
    panelPositionStyle.bottom = 0;
  }

  // 2 — One MemoryRouter owns the route tree for this mounted shell and is
  // portaled unchanged between the host document and detached popup.
  // 6 — Closing only translates that mounted tree; remounting this component
  // recreates the router from its /sessions initial entry.
  return (
    <MemoryRouter initialEntries={['/sessions']}>
      {createPortal(
        <div data-testid={ZEROSPIN_DEVTOOLS}>
          {!settings.triggerHidden && !isOpen && pipWindow === null ? (
            <button
              type="button"
              aria-label="Open Zerospin DevTools"
              onMouseEnter={() => setIsTriggerHovered(true)}
              onMouseLeave={() => setIsTriggerHovered(false)}
              onClick={toggleOpen}
              style={{
                ...triggerPositionStyle,
                position: 'fixed',
                zIndex: 100000,
                width: 36,
                height: 36,
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                opacity: settings.hideUntilHover && !isTriggerHovered ? 0 : 1,
                transition: 'opacity 150ms ease',
              }}
            >
              <img
                src={triggerLogo}
                alt=""
                width={36}
                height={36}
                style={{ display: 'block', borderRadius: '50%' }}
              />
            </button>
          ) : null}

          <section
            id={ZEROSPIN_DEVTOOLS}
            ref={panelRef}
            aria-label="Zerospin DevTools"
            style={{
              ...panelPositionStyle,
              position: pipWindow === null ? 'fixed' : 'relative',
              right: 0,
              zIndex: 99999,
              display: 'flex',
              width: '100%',
              height:
                pipWindow === null
                  ? Math.min(height, window.innerHeight * 0.9)
                  : '100vh',
              maxHeight: pipWindow === null ? '90vh' : '100vh',
              boxSizing: 'border-box',
              overflow: 'hidden',
              color: isDark ? tokens.colors.gray[100] : tokens.colors.gray[900],
              backgroundColor: isDark
                ? tokens.colors.darkGray[800]
                : tokens.colors.white,
              borderTop:
                settings.panelLocation === 'bottom'
                  ? `1px solid ${isDark ? tokens.colors.gray[800] : tokens.colors.gray[200]}`
                  : 'none',
              borderBottom:
                settings.panelLocation === 'top'
                  ? `1px solid ${isDark ? tokens.colors.gray[800] : tokens.colors.gray[200]}`
                  : 'none',
              transform:
                isOpen || pipWindow !== null
                  ? 'translateY(0)'
                  : settings.panelLocation === 'bottom'
                    ? 'translateY(100%)'
                    : 'translateY(-100%)',
              visibility: isOpen || pipWindow !== null ? 'visible' : 'hidden',
              pointerEvents: isOpen || pipWindow !== null ? 'auto' : 'none',
              transition: isResizing ? 'none' : 'transform 400ms ease',
            }}
          >
            <div
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This focusable draggable panel splitter needs interactive separator semantics rather than a thematic break.
              role="separator"
              tabIndex={0}
              aria-label="Resize Zerospin DevTools"
              aria-orientation="horizontal"
              onMouseDown={handleDragStart}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: settings.panelLocation === 'bottom' ? 0 : undefined,
                bottom: settings.panelLocation === 'top' ? 0 : undefined,
                zIndex: 2,
                height: 4,
                cursor: 'ns-resize',
              }}
            />
            <DevtoolsRoutes
              configuredTheme={configuredTheme}
              isDetached={pipWindow !== null}
              onClose={toggleOpen}
              onDetach={requestPipWindow}
            />
          </section>
        </div>,
        portalTarget,
      )}
    </MemoryRouter>
  );
}
