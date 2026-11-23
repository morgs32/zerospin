import { fileURLToPath } from 'node:url';

import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  staticDirs: ['../public'],
  framework: '@storybook/nextjs-vite',
  viteFinal: config => ({
    ...config,
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
  }),
};

export default config;
