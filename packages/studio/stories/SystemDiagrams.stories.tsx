import type { Meta, StoryObj } from '@storybook/react-vite';
import { SystemDiagrams } from '@zerospin/system-diagrams';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { filteringSystemSpec } from './declarationStoryData.js';
import '@zerospin/system-diagrams/styles.css';

const meta = {
  title: 'Studio/SystemDiagrams',
  component: SystemDiagrams,
  render: args => <SystemDiagrams {...args} />,
  args: {
    systemSpec: filteringSystemSpec,
    navigation: {
      sectionId: 'system-board-aggregate-organization',
      basePath: '',
    },
  },
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const originalUrl = window.location.href;
    const url = new URL(originalUrl);
    url.searchParams.delete('actor');
    url.searchParams.delete('agent');
    url.searchParams.delete('version');
    window.history.replaceState(window.history.state, '', url);
    return () => {
      window.history.replaceState(window.history.state, '', originalUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };
  },
} satisfies Meta<typeof SystemDiagrams>;
export default meta;
type IStory = StoryObj<typeof meta>;

export const Filtering: IStory = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const models = within(
      canvas.getByRole('region', { name: 'Models declarations' }),
    );
    const contracts = within(
      canvas.getByRole('region', { name: 'Contracts declarations' }),
    );

    await expect(
      models.getByText('privateNote', { exact: true }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('tab', { name: 'mentor v1' }));
    await expect(new URLSearchParams(window.location.search).has('actor')).toBe(
      false,
    );
    await expect(
      models.getByText('privateNote', { exact: true }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: 'View mentor v1' }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('actor')).toBe(
        'mentor',
      ),
    );
    await expect(
      models.queryByText('privateNote', { exact: true }),
    ).not.toBeInTheDocument();
    await expect(
      models.getByText('displayName', { exact: true }),
    ).toBeVisible();
    await expect(contracts.getByText('None declared.')).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'View administrator v1' }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: 'View digestWorker v1' }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole('tab', { name: 'mentor v2' }));
    await expect(
      new URLSearchParams(window.location.search).get('version'),
    ).toBe('1');
    await expect(contracts.getByText('None declared.')).toBeVisible();
    await userEvent.click(canvas.getByRole('link', { name: 'View mentor v2' }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('version')).toBe(
        '2',
      ),
    );
    await expect(models.getByText('email', { exact: true })).toBeVisible();
    await expect(
      contracts.getByRole('tab', { name: 'updateRoster v2' }),
    ).toBeVisible();
    await expect(
      contracts.queryByRole('tab', { name: 'updateRoster v1' }),
    ).not.toBeInTheDocument();
    await expect(contracts.getByText('message', { exact: true })).toBeVisible();

    await userEvent.click(
      canvas.getByRole('link', { name: 'View digestWorker v1' }),
    );
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('agent')).toBe(
        'digestWorker',
      ),
    );
    await expect(new URLSearchParams(window.location.search).has('actor')).toBe(
      false,
    );
    await expect(models.getByText('digest', { exact: true })).toBeVisible();
    await expect(
      models.getByText('queuedMessage', { exact: true }),
    ).toBeVisible();
    await expect(
      models.queryByText('roster', { exact: true }),
    ).not.toBeInTheDocument();
    await expect(
      contracts.getByRole('tab', { name: 'sendDigest v1' }),
    ).toBeVisible();

    window.history.back();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('actor')).toBe(
        'mentor',
      ),
    );
    await expect(
      canvas.getByRole('tab', { name: 'mentor v2' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(models.getByText('email', { exact: true })).toBeVisible();
    window.history.forward();
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('agent')).toBe(
        'digestWorker',
      ),
    );

    await userEvent.click(
      canvas.getByRole('link', { name: 'Clear declaration filter' }),
    );
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).has('agent')).toBe(
        false,
      ),
    );
    await expect(
      models.getByText('privateNote', { exact: true }),
    ).toBeVisible();
    await expect(models.getByText('audit', { exact: true })).toBeVisible();

    const unavailableUrl = new URL(window.location.href);
    unavailableUrl.searchParams.set('actor', 'mentor');
    unavailableUrl.searchParams.set('version', '99');
    window.history.pushState(window.history.state, '', unavailableUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await expect(
      await canvas.findByText('Selection unavailable'),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('link', { name: 'Clear declaration filter' }),
    );
    await expect(models.getByText('audit', { exact: true })).toBeVisible();
  },
};

export const Empty: IStory = {
  args: {
    systemSpec: { ...filteringSystemSpec, aggregates: {} },
    navigation: { sectionId: undefined, basePath: '' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('No aggregates or services declared.'),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('link', { name: /^View / }),
    ).not.toBeInTheDocument();
  },
};
