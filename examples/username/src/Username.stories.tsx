import { userId } from './userId';

export default { title: 'Username' };

export const Default = {
  render: () => {
    // TODO Open usernameStorySessionDefinition with usernameStory.worker.ts.
    // Once the standalone session is ready, stage createUser once with { id: userId }.
    // Use stageAggregateSessionCommand from examples/list-system/src/ListSystem.stories.tsx.
    // Render UsernamePage after setup.
  },
};

function UsernamePage() {
  // TODO Live-query the user row by userId.
  // Center a column in the full viewport with the input above the greeting.
  // Input reference: examples/shopping/src/components/ui/input.tsx.
  // On submit, trim the input and stage updateUsername with { username: value || null }.
  // When username is a string, render Hello {username} in Inter at about 6rem.
}
