import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: [
          {
            find: /^@zerospin\/devtools\/(.+)$/,
            replacement:
              fileURLToPath(new URL('../../devtools/src/', import.meta.url)) +
              '$1',
          },
        ],
      },
      server: {
        allowedHosts: ['devtools.zerospin.localhost'],
        ws: { clientPort: 443 },
      },
    });
  },
};

export default config;
