import { useEffect, useId, useRef, useState } from 'react';

import '@fontsource-variable/inter';
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
import { stageAggregateSessionCommand } from '@zerospin/sdk/browser';

import { userId } from './userId';
// oxlint-disable-next-line import/default -- Vite generates the URL module.
import sharedWorkerUrl from './usernameStory.worker?sharedworker&url';
import { usernameStorySessionDefinition } from './usernameStorySessionDefinition';
import './username.css';

const backupPath = RoutePattern.parse('/stories/username/:aggregateId');

function UsernameStory() {
  const [claims] = useState(() => ({ aggregateId: crypto.randomUUID() }));
  const [failure, setFailure] = useState<string | null>(null);
  const session = useStandaloneAggregateSession(
    usernameStorySessionDefinition,
    { claims, backupPath, sharedWorkerUrl },
    { onFailure: error => setFailure(error.message) },
  );

  return (
    <SessionProvider session={session}>
      <SessionReady
        definition={usernameStorySessionDefinition}
        fallback={<p role="status">Opening username session…</p>}
        renderError={(error, retry) => (
          <>
            <p role="alert">{error.message}</p>
            <Button type="button" onClick={retry}>
              Retry opening session
            </Button>
          </>
        )}
      >
        <UsernameSetup />
        {failure === null ? null : <p role="alert">{failure}</p>}
      </SessionReady>
    </SessionProvider>
  );
}

function UsernameSetup() {
  const session = useSession(usernameStorySessionDefinition);
  const { data: user } = useLiveQuery({
    session,
    query: db => db.query.user.findFirst({ where: { id: { eq: userId } } }),
  });

  const stagedSession = useRef<typeof session | null>(null);
  useEffect(() => {
    if (user !== undefined || stagedSession.current === session) return;
    stagedSession.current = session;
    stageAggregateSessionCommand({
      session,
      contractName: 'createUser',
      payload: { id: userId },
    });
  }, [session, user]);

  return user === undefined ? (
    <p role="status">Creating user…</p>
  ) : (
    <UsernamePage />
  );
}

function UsernamePage() {
  const session = useSession(usernameStorySessionDefinition);
  const { data: user } = useLiveQuery({
    session,
    query: db => db.query.user.findFirst({ where: { id: { eq: userId } } }),
  });
  const inputId = useId();
  const [draft, setDraft] = useState(user?.username ?? '');

  return (
    <main className="username-page">
      <form
        onSubmit={event => {
          event.preventDefault();
          stageAggregateSessionCommand({
            session,
            contractName: 'updateUsername',
            payload: { username: draft.trim() || null },
          });
        }}
      >
        <label htmlFor={inputId}>Username</label>
        <div className="username-input">
          <Input id={inputId} value={draft} onValueChange={setDraft} />
          <Button type="submit">Save</Button>
        </div>
      </form>
      {typeof user?.username === 'string' && <h1>Hello {user.username}</h1>}
    </main>
  );
}

const meta = {
  title: 'Username',
  component: UsernameStory,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof UsernameStory>;

// oxlint-disable-next-line import/no-default-export -- Storybook reads the default export.
export default meta;

export const Default: StoryObj<typeof meta> = {};
