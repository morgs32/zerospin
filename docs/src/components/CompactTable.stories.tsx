import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CompactTable } from './CompactTable';

const meta = {
  title: 'Components/CompactTable',
  component: CompactTable,
  decorators: [
    Story => (
      <div style={{ width: 420, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    caption: 'List v1',
    rows: [
      { id: 'invoice', label: '◉ Send Invoice' },
      { id: 'compliance', label: 'Get SOC compliant', icon: '＋' },
      { id: 'documentation', label: 'Finish documentation', icon: '↓' },
      { id: 'hackathon', label: 'Host hackathon', icon: '＋' },
      { id: 'publicist', label: 'Hire publicist', icon: '↓' },
    ],
  },
} satisfies Meta<typeof CompactTable>;

export default meta;

type IStory = StoryObj<typeof meta>;

export const ListV1: IStory = {};
export const ListV2: IStory = { args: { caption: 'List v2' } };
