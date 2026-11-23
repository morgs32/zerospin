import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CustomerStrip } from './CustomerStrip';

const meta = {
  title: 'Components/Customer Strip',
  component: CustomerStrip,
} satisfies Meta<typeof CustomerStrip>;

export default meta;

type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
