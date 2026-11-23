import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  viteFinal(config) {
    return mergeConfig(config, {
      server: {
        allowedHosts: ['username.zerospin.localhost'],
        ws: { clientPort: 443 },
      },
    });
  },
};

// oxlint-disable-next-line import/no-default-export -- Storybook reads the default export.
export default config;
