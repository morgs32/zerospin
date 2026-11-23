import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { createStore } from 'zustand/vanilla';

import { TriggerPositionSchema } from './TriggerPositionSchema.js';
import type { IDevtoolsStore, IZerospinDevtoolsConfig } from './types.js';
import {
  getStorageItem,
  setStorageItem,
  ZEROSPIN_DEVTOOLS_SETTINGS,
  ZEROSPIN_DEVTOOLS_STATE,
} from './utils/storage.js';

export const DevtoolsHotkeySchema = Schema.Array(Schema.NonEmptyString).check(
  Schema.makeFilter(
    keys => new Set(keys.map(key => key.toUpperCase())).size === keys.length,
  ),
);
const SettingsSchema = Schema.Struct({
  defaultOpen: Schema.Boolean,
  hideUntilHover: Schema.Boolean,
  position: TriggerPositionSchema,
  panelLocation: Schema.Literals(['top', 'bottom']),
  openHotkey: DevtoolsHotkeySchema,
  theme: Schema.Literals(['light', 'dark']),
  triggerHidden: Schema.Boolean,
});
const StateSchema = Schema.Struct({
  height: Schema.Number.check(
    Schema.isFinite(),
    Schema.isGreaterThanOrEqualTo(70),
  ),
  persistOpen: Schema.Boolean,
});

export const initialState: IDevtoolsStore = {
  settings: {
    defaultOpen: false,
    hideUntilHover: false,
    position: 'bottom-right',
    panelLocation: 'bottom',
    openHotkey: ['Control', '~'],
    theme:
      typeof window !== 'undefined' &&
      typeof window.matchMedia !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
    triggerHidden: false,
  },
  state: {
    height: 400,
    persistOpen: false,
  },
};

export function readDevtoolsPreferences(
  config?: IZerospinDevtoolsConfig,
): IDevtoolsStore {
  const state = Schema.decodeUnknownResult(Schema.fromJsonString(StateSchema), {
    onExcessProperty: 'error',
  })(getStorageItem(ZEROSPIN_DEVTOOLS_STATE));
  const saved = Schema.decodeUnknownResult(
    Schema.fromJsonString(SettingsSchema),
    { onExcessProperty: 'error' },
  )(getStorageItem(ZEROSPIN_DEVTOOLS_SETTINGS));
  const settings = Result.isSuccess(saved) ? saved.success : undefined;
  return {
    state: Result.isSuccess(state) ? state.success : { ...initialState.state },
    settings: Schema.decodeUnknownSync(SettingsSchema)(
      {
        ...initialState.settings,
        ...config,
        ...settings,
        theme: config?.theme ?? settings?.theme ?? initialState.settings.theme,
      },
      { onExcessProperty: 'error' },
    ),
  };
}

export const devtoolsStore = createStore<IDevtoolsStore>()(() =>
  readDevtoolsPreferences(),
);

devtoolsStore.subscribe(state => {
  if (Schema.is(SettingsSchema)(state.settings)) {
    setStorageItem(ZEROSPIN_DEVTOOLS_SETTINGS, JSON.stringify(state.settings));
  }
  if (Schema.is(StateSchema)(state.state)) {
    setStorageItem(ZEROSPIN_DEVTOOLS_STATE, JSON.stringify(state.state));
  }
});
