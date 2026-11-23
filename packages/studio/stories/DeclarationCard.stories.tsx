import type { Meta, StoryObj } from '@storybook/react-vite';
import { PrimitiveKind } from '@zerospin/shapes';
import { DeclarationCard } from '@zerospin/system-diagrams';
import { expect, fn, userEvent, within } from 'storybook/test';

import {
  actorCard,
  agentCard,
  contractCard,
  modelCard,
} from './declarationStoryData.js';
import '@zerospin/system-diagrams/styles.css';

const meta = {
  title: 'Studio/DeclarationCard',
  component: DeclarationCard,
  decorators: [
    Story => (
      <div className="system-diagrams" style={{ padding: 24 }}>
        <div
          style={{
            width: 360,
            maxWidth: '100%',
            padding: 16,
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  args: { card: modelCard },
} satisfies Meta<typeof DeclarationCard>;
export default meta;
type IStory = StoryObj<typeof meta>;
export const Model: IStory = {};
export const Actor: IStory = { args: { card: actorCard } };
export const Agent: IStory = { args: { card: agentCard } };
export const Contract: IStory = { args: { card: contractCard } };
export const MultipleVersions: IStory = {
  args: {
    card: {
      ...modelCard,
      versions: [1, 2],
      models: [
        ...modelCard.models,
        ...modelCard.models.map(model => ({
          ...model,
          version: 2,
          propertiesShape: {
            ...model.propertiesShape,
            description: {
              kind: PrimitiveKind.Text,
              primaryKey: false,
              nullable: true,
              unique: false,
            },
          },
        })),
      ],
    },
  },
};
export const EmptyFields: IStory = {
  args: {
    card: {
      ...modelCard,
      models: modelCard.models.map(model => ({
        ...model,
        propertiesShape: {},
      })),
    },
  },
};

export const MultipleActorVersions: IStory = {
  args: {
    card: { ...actorCard, versions: [1, 2] },
    view: {
      href: version => `?actor=mentor&version=${version}`,
      onNavigate: fn(),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('tab', { name: 'mentor v2' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('link', { name: 'View mentor v2' }),
    ).toHaveAttribute('href', '?actor=mentor&version=2');
    await userEvent.click(canvas.getByRole('tab', { name: 'mentor v1' }));
    await expect(args.view?.onNavigate).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole('link', { name: 'View mentor v1' }));
    await expect(args.view?.onNavigate).toHaveBeenCalledWith(1);
  },
};
