import { useEffect, useState } from 'react';

import { RoutePattern } from '@remix-run/route-pattern';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { devtoolsStore } from '@zerospin/devtools/store';
import type { IZerospinDevtoolsTheme } from '@zerospin/devtools/types';
import { ZerospinDevtools } from '@zerospin/devtools/ZerospinDevtools';
import { zerospinDevtoolsController } from '@zerospin/devtools/zerospinDevtoolsController';
import { useStandaloneAggregateSession } from '@zerospin/react';
import { stageAggregateSessionCommand } from '@zerospin/sdk/browser';
import { expect, userEvent, within } from 'storybook/test';

// oxlint-disable-next-line import/default -- Vite exports the bundled SharedWorker URL for this query.
import sharedWorkerUrl from './list.worker?sharedworker&url';
import { listSession } from './listSession';

const backupPath = RoutePattern.parse('/stories/devtools/:aggregateId');

const items = [
  'Peaches',
  'Ask the baker to slice the sourdough loaf and wrap each half separately for the freezer.',
  'Green beans',
  'Fresh basil',
  'Olive oil',
  'Lemons',
  'Chickpeas',
  'Garlic',
  'Rice',
  'Apricots',
  'Carrots',
  'Tomatoes',
  'Parsley',
  'Pasta',
  'Parmesan',
  'Oats',
];

function PopulatedPanel({ theme }: { theme: IZerospinDevtoolsTheme }) {
  const [options] = useState(() => ({
    claims: { aggregateId: crypto.randomUUID() },
    backupPath,
    sharedWorkerUrl,
  }));
  const { session, error } = useStandaloneAggregateSession(
    listSession,
    options,
  );
  useEffect(() => {
    devtoolsStore.setState(({ settings }) => ({
      settings: { ...settings, theme },
    }));
  }, [theme]);

  useEffect(() => {
    if (session === null) return;
    const { initialized } = session.store.getState();
    if (initialized === null) return;
    const existing = new Set(
      initialized.db.query.listItem
        .findMany()
        .sync()
        .map(row => row.id),
    );
    for (const [index, text] of items.entries()) {
      const id = `lit_${index + 1}` as const;
      if (existing.has(id)) continue;
      const result = stageAggregateSessionCommand({
        session,
        contractName: 'addListItem',
        payload: { id, text },
      });
      if (result._tag === 'Failure') throw result.failure;
    }
  }, [session]);

  if (error !== null) throw error;
  return <ZerospinDevtools config={{ defaultOpen: true, theme }} />;
}

const meta = {
  title: 'Devtools',
  render: (_args, { globals }) => (
    <PopulatedPanel theme={globals.theme === 'light' ? 'light' : 'dark'} />
  ),
} satisfies Meta;

export default meta;

export const PopulatedDatabase: StoryObj<typeof meta> = {
  name: 'Populated Database',
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await zerospinDevtoolsController.open();
    const database = await page.findByRole(
      'link',
      { name: 'Database' },
      { timeout: 15_000 },
    );
    await userEvent.click(database);
    await expect(
      await page.findByRole('cell', { name: 'Peaches' }),
    ).toBeVisible();
  },
};
