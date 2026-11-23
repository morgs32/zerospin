import type { Meta, StoryObj } from '@storybook/react-vite';
import { DeclarationColumn } from '@zerospin/system-diagrams';

import {
  actorCard,
  agentCard,
  contractCard,
  modelCard,
} from './declarationStoryData.js';
import '@zerospin/system-diagrams/styles.css';

const meta = {
  title: 'Studio/DeclarationColumn',
  component: DeclarationColumn,
  decorators: [
    Story => (
      <div className="system-diagrams" style={{ padding: 24 }}>
        <div
          className="system-board"
          style={{
            width: 360,
            flex: '0 1 360px',
            maxWidth: '100%',
            gridTemplateColumns: 'minmax(0, 1fr)',
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  args: { type: 'model', declarations: [modelCard] },
} satisfies Meta<typeof DeclarationColumn>;
export default meta;
type IStory = StoryObj<typeof meta>;
export const Models: IStory = {
  args: {
    declarations: ['channel', 'course', 'mentor'].map(name => ({
      ...modelCard,
      id: name,
      name,
      models: modelCard.models.map(model => ({ ...model, modelName: name })),
    })),
  },
};
export const Actors: IStory = {
  args: {
    type: 'actor',
    declarations: [
      actorCard,
      { ...actorCard, id: 'orgAdmin', name: 'orgAdmin' },
      { ...actorCard, id: 'schoolAdmin', name: 'schoolAdmin' },
    ],
  },
};
export const Agents: IStory = {
  args: { type: 'agent', declarations: [agentCard] },
};
export const Contracts: IStory = {
  args: { type: 'contract', declarations: [contractCard] },
};
export const Empty: IStory = { args: { type: 'agent', declarations: [] } };
export const Overflow: IStory = {
  args: {
    declarations: Array.from({ length: 24 }, (_, index) => ({
      ...modelCard,
      id: `model-${index}`,
      name: `model${index + 1}`,
    })),
  },
};
