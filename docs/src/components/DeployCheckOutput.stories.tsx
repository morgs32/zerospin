import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DeployCheckOutput } from './DeployCheckOutput';
import './DeployCheckOutput.css';

const meta = {
  title: 'Components/Deploy Check Output',
  component: DeployCheckOutput,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className="terminal-output-story deploy-check-story-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DeployCheckOutput>;

export default meta;
type IStory = StoryObj<typeof meta>;

export const Default: IStory = {};
