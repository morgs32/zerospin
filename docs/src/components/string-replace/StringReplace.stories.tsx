import { StrictMode, useRef, useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { HeroHeadline } from './HeroHeadline';
import StringReplace, { type IStringReplaceHandle } from './StringReplace';

const meta = {
  title: 'Components/String Replace',
  component: StringReplace,
  args: { initialText: 'Trust your software works' },
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <StrictMode>
        <div style={{ width: 500, maxWidth: '100%' }}>
          <Story />
        </div>
      </StrictMode>
    ),
  ],
} satisfies Meta<typeof StringReplace>;
export default meta;
type IStory = StoryObj<typeof meta>;
export const Static: IStory = {};

function Controlled({ second = false }: { second?: boolean }) {
  const ref = useRef<IStringReplaceHandle>(null);
  const [mounted, setMounted] = useState(true);
  const [completions, setCompletions] = useState<string[]>([]);
  return (
    <>
      <button
        onClick={() =>
          ref.current?.replaceWith('Trust your software works offline')
        }
      >
        Replace
      </button>
      <button onClick={() => ref.current?.replaceWith('Trust your users')}>
        Interrupt
      </button>
      <button
        onClick={() => ref.current?.replaceWith('Trust your software works')}
      >
        Original text
      </button>
      <button onClick={() => ref.current?.reset()}>Reset</button>
      <button onClick={() => setMounted(value => !value)}>Toggle mount</button>
      {mounted && (
        <StringReplace
          ref={ref}
          initialText="Trust your software works"
          letterDelay={100}
          onComplete={text => setCompletions(values => [...values, text])}
        />
      )}
      {second && <StringReplace initialText="Independent text" />}
      <output
        aria-label="Completions"
        style={{ display: 'block', marginTop: 48 }}
      >
        {JSON.stringify(completions)}
      </output>
    </>
  );
}
export const RefControlled: IStory = { render: () => <Controlled /> };
export const IndependentInstances: IStory = {
  render: () => <Controlled second />,
};
export const HomepageLoop: IStory = { render: () => <HeroHeadline /> };
