import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BlogSection } from './BlogSection';

const meta = {
  title: 'Components/Blog Section',
  component: BlogSection,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof BlogSection>;

export default meta;
type IStory = StoryObj<typeof meta>;
export const Default: IStory = {};
