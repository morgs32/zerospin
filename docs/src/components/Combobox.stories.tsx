import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Combobox } from './Combobox';

const meta = {
  title: 'Components/Combobox',
  component: Combobox,
  decorators: [
    Story => (
      <div style={{ width: 304, maxWidth: '100%', padding: '40px 0' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Role',
    options: [
      { value: 'admin', label: 'Admin' },
      { value: 'reader', label: 'Reader' },
    ],
    defaultValue: 'admin',
  },
} satisfies Meta<typeof Combobox>;

export default meta;

type IStory = StoryObj<typeof meta>;

export const Open: IStory = { args: { defaultOpen: true } };

export const Closed: IStory = {};

export const Placeholder: IStory = {
  args: { defaultValue: null, placeholder: 'Choose a role' },
};

export const Disabled: IStory = { args: { disabled: true } };

export const Filtering: IStory = {
  args: {
    defaultOpen: true,
    defaultValue: null,
    defaultInputValue: 'rea',
    options: [
      { value: 'role-1', label: 'Admin' },
      { value: 'role-2', label: 'Editor' },
      { value: 'role-3', label: 'Reader' },
      { value: 'role-4', label: 'Owner' },
      { value: 'role-5', label: 'Reading only', disabled: true },
    ],
  },
};

export const NoResults: IStory = {
  args: {
    defaultOpen: true,
    defaultValue: null,
    defaultInputValue: 'zzz',
  },
};

export const Controlled: IStory = {
  args: { defaultValue: undefined },
  render: function ControlledCombobox(args) {
    const [value, setValue] = useState<string | null>('admin');

    return (
      <div>
        <Combobox {...args} value={value} onValueChange={setValue} />
        <p style={{ fontSize: 12 }}>Selected value: {value ?? 'None'}</p>
      </div>
    );
  },
};

export const CancelledChanges: IStory = {
  args: {
    onOpenChange: (_open, details) => details.cancel(),
    onInputValueChange: (_inputValue, details) => details.cancel(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Callbacks cancel popup and query changes, preserving Admin.',
      },
    },
  },
};
