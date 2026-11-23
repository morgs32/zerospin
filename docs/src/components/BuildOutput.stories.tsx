import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BuildOutput } from './BuildOutput';
import './BuildOutput.css';

const meta = {
  title: 'Components/Build Output',
  component: BuildOutput,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className="terminal-output-story build-output-story-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BuildOutput>;

export default meta;
type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
