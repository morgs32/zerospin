import type { Preview } from '@storybook/react-vite';

const preview: Preview = {
  parameters: { layout: 'fullscreen' },
  globalTypes: {
    theme: {
      description: 'Devtools panel colors',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
};

export default preview;
