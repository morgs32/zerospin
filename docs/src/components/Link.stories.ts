import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Link } from './Link';

const meta = {
  title: 'Components/Link',
  component: Link,
  args: {
    children: 'Documentation',
    href: 'https://fragment.dev/docs',
  },
} satisfies Meta<typeof Link>;

export default meta;

type IStory = StoryObj<typeof meta>;

export const Underlined: IStory = {};

export const Plain: IStory = {
  args: { underlined: false },
};
