import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  viteFinal(config) {
    return mergeConfig(config, {
      server: {
        allowedHosts: ['list-system.zerospin.localhost'],
        hmr: { clientPort: 443 },
      },
    });
  },
};

export default config;
