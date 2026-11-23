'use client';

import { DevtoolsFrame } from './shell/DevtoolsFrame.js';
import { useDetachedDevtoolsWindow } from './shell/useDetachedDevtoolsWindow.js';
import { useDevtoolsKeyboard } from './shell/useDevtoolsKeyboard.js';
import { useDevtoolsPanelResize } from './shell/useDevtoolsPanelResize.js';
import { useDevtoolsPreferences } from './shell/useDevtoolsPreferences.js';
import { useDevtoolsVisibility } from './shell/useDevtoolsVisibility.js';
import type { IZerospinDevtoolsConfig } from './types.js';

/** One mounted shell owns preferences, native interactions and its retained router. */
export function ZerospinDevtools({
  config,
}: { config?: IZerospinDevtoolsConfig } = {}) {
  const preferences = useDevtoolsPreferences(config);
  const detached = useDetachedDevtoolsWindow(
    preferences.settings.theme,
    preferences.height,
  );
  const visibility = useDevtoolsVisibility(
    preferences.initialOpen,
    preferences.mounted,
    detached,
  );
  const resize = useDevtoolsPanelResize(
    preferences.settings.panelLocation,
    visibility,
    detached.popup,
  );
  useDevtoolsKeyboard(preferences.settings.openHotkey, visibility);
  if (!preferences.mounted) return null;
  return (
    <DevtoolsFrame
      settings={preferences.settings}
      configuredTheme={preferences.configuredTheme}
      height={preferences.height}
      visibility={visibility}
      resize={resize}
      detached={detached}
    />
  );
}
