import { useEffect, useState } from 'react';

import { useStore } from 'zustand/react';

import { devtoolsStore, readDevtoolsPreferences } from '../store.js';
import type { IZerospinDevtoolsConfig } from '../types.js';

export function useDevtoolsPreferences(
  config: IZerospinDevtoolsConfig | undefined,
) {
  const [initial] = useState(() => ({
    value: readDevtoolsPreferences(config),
    configuredTheme: config?.theme,
  }));
  const [mounted, setMounted] = useState(false);
  const settings = useStore(devtoolsStore, state => state.settings);
  const height = useStore(devtoolsStore, state => state.state.height);
  useEffect(() => {
    devtoolsStore.setState(initial.value, true);
    // oxlint-disable-next-line react/set-state-in-effect -- The portal becomes available only after its preferences hydrate the external store.
    setMounted(true);
  }, [initial]);
  return {
    mounted,
    settings,
    height,
    configuredTheme: initial.configuredTheme,
    initialOpen:
      initial.value.settings.defaultOpen || initial.value.state.persistOpen,
  };
}
