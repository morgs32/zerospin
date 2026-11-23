import { StrictMode, useRef, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { CommandChain, type ICommandChainHandle } from './CommandChain';
import { initialCommandRows, makeCommandRow } from './commandChainRows';
import { HeroAnimation } from './HeroAnimation';
import { taskItemScript } from './taskItemScript';

const meta = {
  title: 'Components/Command Chain',
  component: CommandChain,
  args: { initialRows: initialCommandRows },
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <StrictMode>
        <Story />
      </StrictMode>
    ),
  ],
} satisfies Meta<typeof CommandChain>;
export default meta;
type IStory = StoryObj<typeof meta>;
export const Blurred: IStory = {};
export const MixedCells: IStory = {
  args: {
    initialRows: [
      makeCommandRow(25, taskItemScript[0], true),
      ...initialCommandRows,
    ],
  },
};
function Controlled({ second = false }: { second?: boolean }) {
  const chain = useRef<ICommandChainHandle>(null);
  const id = useRef(25);
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button
        onClick={() =>
          chain.current?.apply({
            prepend: makeCommandRow(id.current++, taskItemScript[0], true),
          })
        }
      >
        Insert row
      </button>
      <button onClick={() => chain.current?.reset()}>Reset</button>
      <button onClick={() => setMounted(value => !value)}>Toggle mount</button>
      <div style={{ display: 'flex' }}>
        <div style={{ flex: 1 }}>
          {mounted && (
            <CommandChain ref={chain} initialRows={initialCommandRows} />
          )}
        </div>
        {second && (
          <div style={{ flex: 1 }}>
            <CommandChain initialRows={initialCommandRows} />
          </div>
        )}
      </div>
    </>
  );
}
export const RefControlled: IStory = { render: () => <Controlled /> };
export const IndependentInstances: IStory = {
  render: () => <Controlled second />,
};
export const HeroPlayback: IStory = {
  render: () => (
    <div className="payment-stage">
      <HeroAnimation />
    </div>
  ),
};
