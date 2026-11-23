import { useEffect } from 'react';

import type { IKeyboardKey } from '../types.js';
import { isHotkeyCombinationPressed } from '../utils/hotkey.js';

import type { useDevtoolsVisibility } from './useDevtoolsVisibility.js';

export function useDevtoolsKeyboard(
  hotkey: readonly IKeyboardKey[],
  visibility: ReturnType<typeof useDevtoolsVisibility>,
) {
  const { isOpen, close, toggle } = visibility;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        close();
        return;
      }
      const element = event.target;
      if (
        element instanceof HTMLElement &&
        (element.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) ||
          element.getAttribute('role') === 'textbox')
      ) {
        return;
      }
      const pressed = [
        event.altKey ? 'Alt' : null,
        event.ctrlKey ? 'Control' : null,
        event.metaKey ? 'Meta' : null,
        event.shiftKey ? 'Shift' : null,
        event.key,
      ].filter((key): key is string => key !== null);
      if (isHotkeyCombinationPressed(pressed, hotkey)) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [isOpen, close, toggle, hotkey]);
}
