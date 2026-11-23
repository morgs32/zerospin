import type { Preview } from '@storybook/nextjs-vite';

import '../src/styles.css';

const preview: Preview = {
  decorators: [
    Story => {
      document.documentElement.classList.add('fragment-appearance');
      return Story();
    },
  ],
};

export default preview;
