import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ChangelogSection } from './ChangelogSection';

const meta = {
  title: 'Components/Changelog Section',
  component: ChangelogSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ChangelogSection>;

export default meta;
type IStory = StoryObj<typeof meta>;
export const Default: IStory = {};
