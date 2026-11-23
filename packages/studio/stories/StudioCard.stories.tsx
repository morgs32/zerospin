import type { Meta, StoryObj } from '@storybook/react-vite';
import { StudioCard } from '@zerospin/system-diagrams';
import '@zerospin/system-diagrams/styles.css';

const meta = {
  title: 'Studio/StudioCard',
  component: StudioCard,
  decorators: [
    Story => (
      <div className="system-diagrams" style={{ padding: 24 }}>
        <div style={{ width: 360, maxWidth: '100%' }}>
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    children: (
      <>
        <h2>
          channel <span className="system-board-badge">v1</span>
        </h2>
        <p className="system-board-empty">Declaration content</p>
      </>
    ),
  },
} satisfies Meta<typeof StudioCard>;
export default meta;
type IStory = StoryObj<typeof meta>;
export const Default: IStory = {};
