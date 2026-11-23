import { useId, useState } from 'react';

import { Button } from '@base-ui/react/button';
import { Input } from '@base-ui/react/input';
import { RoutePattern } from '@remix-run/route-pattern';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  SessionProvider,
  SessionReady,
  useLiveQuery,
  useSession,
  useStandaloneAggregateSession,
} from '@zerospin/react';
import {
  makeAggregateSessionModelId,
  stageAggregateSessionCommand,
} from '@zerospin/sdk/browser';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { listItemV1 } from './listItemV1';
import sharedWorkerUrl from './listStory.worker?sharedworker&url';
import { listStorySessionDefinition } from './listStorySessionDefinition';

const backupPath = RoutePattern.parse('/stories/list-system/:aggregateId');

function ListSystem() {
  const [claims] = useState(() => ({ aggregateId: crypto.randomUUID() }));
  const [generation, setGeneration] = useState(0);

  return (
    <main style={{ width: 'min(26rem, 90vw)' }}>
      <h1>List System</h1>
      <ListSession
        key={generation}
        claims={claims}
        onReopen={() => setGeneration(current => current + 1)}
      />
    </main>
  );
}

function ListSession(props: {
  claims: { aggregateId: string };
  onReopen: () => void;
}) {
  const [failure, setFailure] = useState<string | null>(null);
  const session = useStandaloneAggregateSession(
    listStorySessionDefinition,
    { claims: props.claims, backupPath, sharedWorkerUrl },
    { onFailure: error => setFailure(error.message) },
  );

  return (
    <SessionProvider session={session}>
      <SessionReady
        definition={listStorySessionDefinition}
        fallback={<p role="status">Opening list…</p>}
        renderError={(error, retry) => (
          <>
            <p role="alert">{error.message}</p>
            <Button type="button" onClick={retry}>
              Retry opening list
            </Button>
          </>
        )}
      >
        <ListEditor clearFailure={() => setFailure(null)} />
        {failure === null ? null : <p role="alert">{failure}</p>}
        <Button type="button" onClick={props.onReopen}>
          Reopen list
        </Button>
      </SessionReady>
    </SessionProvider>
  );
}

function ListEditor({ clearFailure }: { clearFailure: () => void }) {
  const session = useSession(listStorySessionDefinition);
  const { data: items } = useLiveQuery({
    session,
    query: db =>
      db.query.listItem.findMany({ orderBy: { createdAt: 'asc', id: 'asc' } }),
  });
  const inputId = useId();
  const [draft, setDraft] = useState('');

  return (
    <>
      <form
        onSubmit={event => {
          event.preventDefault();
          const text = draft.trim();
          if (text.length === 0) return;

          clearFailure();
          const id = makeAggregateSessionModelId({
            session,
            model: listItemV1,
          });
          const result = stageAggregateSessionCommand({
            session,
            contractName: 'addListItem',
            payload: { id, text },
          });
          if (result._tag === 'Success') setDraft('');
        }}
      >
        <label htmlFor={inputId}>Item</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Input
            id={inputId}
            value={draft}
            onValueChange={setDraft}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button type="submit" disabled={draft.trim().length === 0}>
            Add item
          </Button>
        </div>
      </form>
      {items.length === 0 ? <p>No items yet.</p> : null}
      <ul aria-label="Items">
        {items.map(item => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </>
  );
}

const meta = {
  title: 'List System',
  component: ListSystem,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ListSystem>;

export default meta;

export const AddAndReopen: StoryObj<typeof meta> = {
  name: 'Add and reopen',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sessionReadyTimeout = { timeout: 15_000 };
    const list = await canvas.findByRole(
      'list',
      { name: 'Items' },
      sessionReadyTimeout,
    );
    await expect(canvas.getByText('No items yet.')).toBeVisible();

    await userEvent.type(canvas.getByRole('textbox', { name: 'Item' }), 'Milk');
    await userEvent.click(canvas.getByRole('button', { name: 'Add item' }));
    await expect(await within(list).findByText('Milk')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Reopen list' }));
    await waitFor(() => expect(list).not.toBeInTheDocument());
    const reopened = within(
      await canvas.findByRole('list', { name: 'Items' }, sessionReadyTimeout),
    );
    await expect(await reopened.findByText('Milk')).toBeVisible();
    await expect(reopened.getAllByRole('listitem')).toHaveLength(1);
  },
};
