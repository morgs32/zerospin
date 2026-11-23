import type { Meta, StoryObj } from '@storybook/react-vite';
import { SystemBoardLayout, SystemOutline } from '@zerospin/system-diagrams';

import { board } from './declarationStoryData.js';
import '@zerospin/system-diagrams/styles.css';

const meta = {
  title: 'Studio/SystemOutline',
  component: SystemOutline,
  decorators: [
    Story => (
      <div className="system-diagrams">
        <Story />
      </div>
    ),
  ],
  args: {
    systemName: 'mentormailbox',
    board,
    activeSectionId: 'organization',
    navigation: { basePath: '/studio' },
  },
  render: function OutlineStory(args) {
    return (
      <SystemBoardLayout outline={<SystemOutline {...args} />}>
        <div className="system-board-content" style={{ padding: 32, gap: 8 }}>
          <h2>
            {[...args.board.aggregates, ...args.board.services].find(
              section => section.id === args.activeSectionId,
            )?.name ?? 'Select an owner'}
          </h2>
          <p className="system-board-empty">
            Drag the outline edge, or focus it and use the arrow keys.
          </p>
        </div>
      </SystemBoardLayout>
    );
  },
} satisfies Meta<typeof SystemOutline>;
export default meta;
type IStory = StoryObj<typeof meta>;
export const Default: IStory = {};
export const Empty: IStory = {
  args: { board: { aggregates: [], services: [] } },
};
export const LongNames: IStory = {
  args: {
    board: {
      aggregates: [
        {
          id: 'long-aggregate',
          name: 'organizationAdministrationAndEnrollment',
          declarations: [],
        },
      ],
      services: [
        {
          id: 'long-service',
          name: 'directMessageChannelMembershipSynchronization',
          declarations: [],
        },
      ],
    },
  },
};
