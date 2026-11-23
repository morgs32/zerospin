import type { IKeyboardKey } from '../types.js';

/** Membership matching needs only the two CtrlOrMeta alternatives, never permutations. */
export function isHotkeyCombinationPressed(
  keys: readonly string[],
  hotkey: readonly IKeyboardKey[],
): boolean {
  const pressed = new Set(keys.map(key => key.toUpperCase()));
  const alternatives = hotkey.includes('CtrlOrMeta')
    ? [
        hotkey.map(key => (key === 'CtrlOrMeta' ? 'Control' : key)),
        hotkey.map(key => (key === 'CtrlOrMeta' ? 'Meta' : key)),
      ]
    : [hotkey];
  return alternatives.some(combination => {
    const expected = new Set(combination.map(key => key.toUpperCase()));
    return (
      expected.size === pressed.size &&
      [...expected].every(key => pressed.has(key))
    );
  });
}
