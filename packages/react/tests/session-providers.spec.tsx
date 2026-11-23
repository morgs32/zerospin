// @vitest-environment jsdom

import { act, Component, StrictMode, useState, type ReactNode } from 'react';

import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import type { IAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import { MonotonicFactory } from '@zerospin/core/services/MonotonicFactory';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import type {
  ISessionFailureReport,
  ISessionLifecycleState,
} from '@zerospin/core/sessionFailure/types';
import {
  ensureZerospinError,
  makeZerospinError,
  type IZerospinError,
} from '@zerospin/error';
import { makeTelemetryCollector, TelemetryCollector } from '@zerospin/logger';
import {
  SessionProvider,
  SessionReady,
  useAggregateCommandOutcome,
  useClearSessionAuthentication,
  useConnectedAggregateSession,
  useLiveQuery,
  useMockAggregateSession,
  useSession,
  useSessionState,
} from '@zerospin/react';
import { CuidFactory } from '@zerospin/shapes';
import { eq } from 'drizzle-orm';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { openTestDb } from '../../../tests/support/openTestDb.ts';

const constructors = vi.hoisted(() => ({
  connected: vi.fn(),
  mock: vi.fn(),
}));

vi.mock('@zerospin/browser/makeConnectedAggregateSession', () => ({
  makeConnectedAggregateSession: constructors.connected,
}));
vi.mock('@zerospin/browser/makeMockAggregateSession', () => ({
  makeMockAggregateSession: constructors.mock,
}));

const accountDefinition = makeAggregateSessionDefinition({
  systemName: 'react-lifetime',
  sessionName: 'account',
  aggregateName: 'account',
  aggregateVersion: 1,
  actorName: 'user',
  actorVersion: 1,
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: {},
  contracts: {},
});
const guestDefinition = makeAggregateSessionDefinition({
  systemName: 'react-lifetime',
  sessionName: 'guest',
  aggregateName: 'guest',
  aggregateVersion: 1,
  actorName: 'user',
  actorVersion: 1,
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: {},
  contracts: {},
});
const credentialsSchema = Schema.Struct({ token: Schema.String });
const applicationLayer = Layer.mergeAll(
  Layer.succeed(PublishableKey, Redacted.make('pk_test')),
  Layer.succeed(ZerospinApiUrl, 'https://react-lifetime.invalid'),
);

interface IFakeInputs {
  definition: IAggregateSessionDefinition;
  getCredentials?: () => Effect.Effect<{ token: string }, unknown>;
}
type IFakeState = ISessionLifecycleState & { initialized: object | null };

/** Only browser acquisition is substituted; the React hooks and providers are real. */
function makeFakeSession(inputs: IFakeInputs) {
  const startup = Promise.withResolvers<void>();
  const store = createStore<IFakeState>(() => ({
    status: 'idle',
    failure: null,
    initialized: null,
  }));
  const reportFailure = vi.fn((report: ISessionFailureReport) => {
    const error = ensureZerospinError({
      code: 'session-failed',
      message: 'Session failed.',
      error: report.error,
    });
    store.setState({
      ...(report.origin === 'session'
        ? { status: 'failed', initialized: null }
        : {}),
      failure: error,
    });
  });
  return {
    sessionDefinition: inputs.definition,
    systemName: inputs.definition.systemName,
    claimsSchema: inputs.definition.claimsSchema,
    store,
    reportFailure,
    initialize: vi.fn(() => {
      store.setState({ status: 'initializing' });
      if (startupNotice) {
        reportFailure({ origin: 'recovery', error: startupNotice });
      }
      return startup.promise;
    }),
    dispose: vi.fn(async () => {
      store.setState({ status: 'disposed', initialized: null });
    }),
    clearAuthentication: vi.fn(async () => {}),
    ready() {
      store.setState({ status: 'ready', initialized: {} });
      startup.resolve();
    },
    readCredentials: inputs.getCredentials,
  };
}
type IFakeSession = ReturnType<typeof makeFakeSession>;

let sessions: IFakeSession[];
let container: HTMLDivElement;
let root: Root;
let readSession: object | null;
let startupNotice: IZerospinError | undefined;

function latestSession() {
  const session = sessions.at(-1);
  if (!session) throw new Error('No session has been constructed.');
  return session;
}

function Reader() {
  readSession = useSession(accountDefinition);
  return <p>Account ready</p>;
}

function AccountState() {
  const { isEnabled, isReady } = useSessionState(accountDefinition);
  return (
    <output>{!isEnabled ? 'inactive' : isReady ? 'ready' : 'opening'}</output>
  );
}

function PublicShell() {
  const [count, setCount] = useState(0);
  return (
    <button id="public-counter" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  );
}

function AccountApp({
  accountId,
  token = 'first',
  onFailure,
}: {
  accountId: string | null;
  token?: string;
  onFailure?: (error: unknown) => void;
}) {
  const account = useConnectedAggregateSession(
    accountDefinition,
    () =>
      accountId
        ? {
            sharedWorkerUrl: '/account.worker.js',
            credentialsSchema,
            layer: applicationLayer,
            aggregateId: accountId,
            getCredentials: () => Effect.succeed({ token }),
          }
        : null,
    onFailure ? { onFailure } : undefined,
  );
  return (
    <SessionProvider session={account}>
      <PublicShell />
      <AccountState />
      <SessionReady
        definition={accountDefinition}
        fallback={<p>Opening account</p>}
        renderError={(error, retry) => (
          <button onClick={retry}>{error.message}</button>
        )}
      >
        <Reader />
      </SessionReady>
    </SessionProvider>
  );
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessions = [];
  readSession = null;
  startupNotice = undefined;
  constructors.connected.mockImplementation((inputs: IFakeInputs) => {
    const session = makeFakeSession(inputs);
    sessions.push(session);
    return session;
  });
  constructors.mock.mockImplementation((inputs: IFakeInputs) => {
    const session = makeFakeSession(inputs);
    sessions.push(session);
    return session;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container, { onCaughtError: () => {} });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it('observes only the authoritative result of the exact staged command', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const opened = yield* openTestDb({});
        const config = makeResourceDbConfig({
          models: {},
          otherTables: aggregateSessionRepoDbConfig.tables,
        });
        const db = makeSqliteDrizzle(opened.db.$client, config);
        yield* provisionDb({ db, definition: config.definition });
        const sessionId = 'sesn_outcome' as const;
        db.insert(config.schema.sessionMetadata)
          .values({
            sessionId,
            lastSessionIndex: 1,
            afterNodeIndex: 0,
            aggregateIndex: 0,
            dispositionChainHash: '0'.repeat(64),
          })
          .run();
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition: accountDefinition,
          db,
          admitted: {
            sessionId,
            aggregateId: 'acc_outcome',
            actorName: 'user',
            actorVersion: 1,
            claims: { aggregateId: 'acc_outcome' },
          },
        });
        const context = Context.make(CuidFactory, () =>
          Effect.succeed('outcome'),
        ).pipe(
          Context.add(MonotonicFactory, () => Effect.succeed('mono')),
          Context.add(TelemetryCollector, makeTelemetryCollector()),
        );
        const session = makeAggregateSession({
          sessionDefinition: accountDefinition,
          execution: {
            runSync: Effect.runSyncWith(context),
            runPromise: Effect.runPromiseWith(context),
          },
          onTerminalFailure: () => {},
        });
        session.store.setState({ status: 'ready', initialized });
        function Outcome(props: { sessionId: string }) {
          const value = useAggregateCommandOutcome({
            session,
            submission: { sessionId: props.sessionId, sessionIndex: 1 },
          });
          return (
            <output>
              {value.status === 'failed'
                ? `${value.status}:${value.failure.code}`
                : value.status}
            </output>
          );
        }
        yield* Effect.promise(() =>
          act(async () => root.render(<Outcome sessionId={sessionId} />)),
        );
        expect(container.textContent).toBe('unknown');
        yield* Effect.promise(() =>
          act(async () => {
            db.insert(config.schema.commands)
              .values({
                sessionIndex: 1,
                commandName: 'send',
                payload: '{}',
                stagingOutcome: '{}',
                nodeId: null,
                nodeIndex: null,
                pushIndex: null,
                inverseOperations: null,
                aggregateIndex: null,
                failure: null,
              })
              .run();
          }),
        );
        expect(container.textContent).toBe('pending');
        yield* Effect.promise(() =>
          act(async () => {
            db.update(config.schema.commands)
              .set({
                aggregateIndex: 1,
                failure: JSON.stringify({
                  _tag: 'ZerospinError',
                  code: 'send-failed',
                  message: 'Failed',
                  status: null,
                  extra: null,
                }),
              })
              .where(eq(config.schema.commands.sessionIndex, 1))
              .run();
          }),
        );
        expect(container.textContent).toBe('failed:send-failed');
        yield* Effect.promise(() =>
          act(async () => root.render(<Outcome sessionId="sesn_other" />)),
        );
        expect(container.textContent).toBe('unknown');
        yield* Effect.promise(() => act(async () => root.unmount()));
      }),
    ),
  );
});

describe('managed React sessions', () => {
  it('clears outside readiness and retains failed revocations for retry', async () => {
    const clearResults: Promise<void>[] = [];
    let retry = () => {};
    function SignOut() {
      const clear = useClearSessionAuthentication(accountDefinition);
      retry = useSessionState(accountDefinition).retry;
      return (
        <button onClick={() => clearResults.push(clear())}>Sign out</button>
      );
    }
    function App(props: { accountId: string | null }) {
      const { accountId } = props;
      const account = useConnectedAggregateSession(
        accountDefinition,
        accountId
          ? {
              sharedWorkerUrl: '/account.worker.js',
              credentialsSchema,
              layer: applicationLayer,
              aggregateId: accountId,
              getCredentials: () => Effect.succeed({ token: 'token' }),
            }
          : null,
      );
      return (
        <SessionProvider session={account}>
          <SignOut />
        </SessionProvider>
      );
    }
    await act(async () => root.render(<App accountId={null} />));
    const button = container.querySelector('button');
    if (button === null) throw new Error('Missing sign-out control.');
    await act(async () => button.click());
    await expect(clearResults.at(-1)).resolves.toBeUndefined();
    expect(sessions).toHaveLength(0);

    await act(async () => root.render(<App accountId="a" />));
    const account = latestSession();
    expect(account.store.getState().status).toBe('initializing');
    const failure = new Error('Discovery unavailable');
    account.clearAuthentication.mockRejectedValueOnce(failure);
    await act(async () => {
      button.click();
      await expect(clearResults.at(-1)).rejects.toBe(failure);
    });
    await act(async () =>
      account.reportFailure({
        origin: 'session',
        error: new Error('Startup failed'),
      }),
    );
    await act(async () => button.click());
    await expect(clearResults.at(-1)).resolves.toBeUndefined();
    expect(account.clearAuthentication).toHaveBeenCalledTimes(2);
    await act(async () => retry());
    expect(sessions).toHaveLength(1);
  });

  it('revokes every retired identity after its provider is disabled', async () => {
    const clearResults: Promise<void>[] = [];
    function SignOut() {
      const clear = useClearSessionAuthentication(accountDefinition);
      return (
        <button onClick={() => clearResults.push(clear())}>Sign out</button>
      );
    }
    function App(props: { accountId: string | null }) {
      const { accountId } = props;
      const account = useConnectedAggregateSession(
        accountDefinition,
        accountId
          ? {
              sharedWorkerUrl: '/account.worker.js',
              credentialsSchema,
              layer: applicationLayer,
              aggregateId: accountId,
              getCredentials: () => Effect.succeed({ token: 'token' }),
            }
          : null,
      );
      return (
        <SessionProvider session={account}>
          <SignOut />
        </SessionProvider>
      );
    }
    await act(async () => root.render(<App accountId="a" />));
    const first = latestSession();
    await act(async () => first.ready());
    await act(async () => root.render(<App accountId="b" />));
    const second = latestSession();
    await act(async () =>
      second.reportFailure({
        origin: 'session',
        error: new Error('Startup failed'),
      }),
    );
    await act(async () => root.render(<App accountId={null} />));
    const button = container.querySelector('button');
    if (button === null) throw new Error('Missing sign-out control.');
    await act(async () => button.click());
    await expect(clearResults.at(-1)).resolves.toBeUndefined();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(first.clearAuthentication).toHaveBeenCalledOnce();
    expect(second.clearAuthentication).toHaveBeenCalledOnce();
  });

  it('preserves the public shell through activation, failure and retry, observing startup notices', async () => {
    const onFailure = vi.fn();
    await act(async () =>
      root.render(<AccountApp accountId={null} onFailure={onFailure} />),
    );
    const shell = container.querySelector('#public-counter');
    if (!(shell instanceof HTMLButtonElement)) {
      throw new Error('Missing shell.');
    }
    await act(async () => shell.click());
    expect(shell.textContent).toBe('1');
    expect(constructors.connected).not.toHaveBeenCalled();
    const notice = makeZerospinError({
      code: 'session-failed',
      message: 'Possible local-work loss.',
    });
    startupNotice = notice;
    await act(async () =>
      root.render(<AccountApp accountId="a" onFailure={onFailure} />),
    );
    const first = latestSession();
    expect(onFailure).toHaveBeenCalledExactlyOnceWith(notice);
    startupNotice = undefined;
    await act(async () => first.ready());
    expect(readSession).toBe(first);
    await act(async () =>
      first.reportFailure({
        origin: 'session',
        error: new Error('Broken account'),
      }),
    );
    expect(container.querySelector('output')?.textContent).toBe('opening');
    const retry = [...container.querySelectorAll('button')].find(
      button => button !== shell,
    );
    if (!retry) throw new Error('Missing retry.');
    await act(async () => {
      retry.click();
      retry.click();
    });
    expect(sessions).toHaveLength(2);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    const replacement = latestSession();
    await act(async () => replacement.ready());
    expect(readSession).toBe(replacement);
    expect(container.querySelector('#public-counter')).toBe(shell);
    expect(shell.textContent).toBe('1');
    expect(onFailure).toHaveBeenCalledTimes(1);
  });

  it.each(['render', 'query'] as const)(
    'routes a %s exception without failing the unrelated session',
    async kind => {
      const failure = new Error('Planner exception');
      const caught = vi.fn();
      class UiBoundary extends Component<{ children: ReactNode }> {
        override state = { failed: false };

        static getDerivedStateFromError() {
          return { failed: true };
        }

        override componentDidCatch(error: unknown) {
          caught(error);
        }

        override render() {
          return this.state.failed ? (
            <p>Planner fallback</p>
          ) : (
            this.props.children
          );
        }
      }

      function BrokenQuery() {
        const session = useSession(accountDefinition);
        useLiveQuery({
          session,
          query: () => {
            throw failure;
          },
        });
        return null;
      }

      function BrokenRender(): never {
        throw failure;
      }

      function NestedApp() {
        const account = useMockAggregateSession(accountDefinition, {
          claims: { aggregateId: 'account' },
        });
        const guest = useMockAggregateSession(guestDefinition, {
          claims: { aggregateId: 'guest' },
        });
        return (
          <SessionProvider session={account}>
            <SessionProvider session={guest}>
              <AccountState />
              <UiBoundary>
                <SessionReady
                  definition={accountDefinition}
                  renderError={(_error, retry) => (
                    <button onClick={retry}>Retry account</button>
                  )}
                >
                  <SessionReady
                    definition={guestDefinition}
                    renderError={() => <p>Guest failed</p>}
                  >
                    {kind === 'query' ? <BrokenQuery /> : <BrokenRender />}
                  </SessionReady>
                </SessionReady>
              </UiBoundary>
            </SessionProvider>
          </SessionProvider>
        );
      }
      await act(async () => root.render(<NestedApp />));
      const account = sessions.find(
        session => session.sessionDefinition === accountDefinition,
      );
      const guest = sessions.find(
        session => session.sessionDefinition === guestDefinition,
      );
      if (!account || !guest) throw new Error('Missing mounted sessions.');
      await act(async () => {
        account.ready();
        account.store.setState({ initialized: { db: {} } });
        guest.ready();
      });
      expect(guest.reportFailure).not.toHaveBeenCalled();
      expect(guest.store.getState().status).toBe('ready');
      if (kind === 'render') {
        expect(caught).toHaveBeenCalledExactlyOnceWith(failure);
        expect(account.reportFailure).not.toHaveBeenCalled();
        expect(account.store.getState().status).toBe('ready');
        expect(container.textContent).toBe('readyPlanner fallback');
        expect(sessions).toHaveLength(2);
      } else {
        expect(caught).not.toHaveBeenCalled();
        expect(account.reportFailure).toHaveBeenCalledExactlyOnceWith({
          origin: 'session',
          error: failure,
        });
        expect(account.store.getState().status).toBe('failed');
        const retry = container.querySelector('button');
        expect(retry?.textContent).toBe('Retry account');
        await act(async () => retry?.click());
        expect(sessions).toHaveLength(3);
        expect(latestSession().sessionDefinition).toBe(accountDefinition);
        expect(guest.dispose).not.toHaveBeenCalled();
      }
    },
  );

  it('shadows a ready outer session with an inactive provider for the same definition', async () => {
    function NestedApp() {
      const outer = useMockAggregateSession(accountDefinition, {
        claims: { aggregateId: 'outer' },
      });
      const inner = useConnectedAggregateSession(accountDefinition, () => null);
      return (
        <SessionProvider session={outer}>
          <SessionProvider session={inner}>
            <AccountState />
            <SessionReady
              definition={accountDefinition}
              fallback={<p>Inactive account</p>}
              renderError={() => <p>Failure</p>}
            >
              <Reader />
            </SessionReady>
          </SessionProvider>
        </SessionProvider>
      );
    }
    await act(async () => root.render(<NestedApp />));
    await act(async () => latestSession().ready());
    expect(container.textContent).toBe('inactive');
    expect(readSession).toBeNull();
    expect(constructors.connected).not.toHaveBeenCalled();
  });

  it('rotates identity without publishing stale startup results and refreshes credentials in place', async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <AccountApp accountId="a" />
        </StrictMode>,
      ),
    );
    const accountA = latestSession();
    await act(async () =>
      root.render(
        <StrictMode>
          <AccountApp accountId="b" token="second" />
        </StrictMode>,
      ),
    );
    const accountB = latestSession();
    expect(accountB).not.toBe(accountA);
    expect(accountA.dispose).toHaveBeenCalled();
    for (const retired of sessions.slice(0, -1)) {
      expect(retired.dispose).toHaveBeenCalledTimes(1);
    }
    await act(async () => accountA.ready());
    expect(readSession).toBeNull();
    expect(container.textContent).not.toContain('Account ready');
    await act(async () => accountB.ready());
    expect(readSession).toBe(accountB);
    const previousCount = sessions.length;
    await act(async () =>
      root.render(
        <StrictMode>
          <AccountApp accountId="b" token="refreshed" />
        </StrictMode>,
      ),
    );
    expect(sessions).toHaveLength(previousCount);
    if (!accountB.readCredentials) throw new Error('Missing credentials.');
    expect(Effect.runSync(accountB.readCredentials())).toEqual({
      token: 'refreshed',
    });
    await act(async () =>
      root.render(
        <StrictMode>
          <AccountApp accountId={null} />
        </StrictMode>,
      ),
    );
    expect(accountB.dispose).toHaveBeenCalled();
    expect(container.querySelector('output')?.textContent).toBe('inactive');
    expect(container.textContent).not.toContain('Account ready');
  });

  it('uses the same reader with mock account and guest sessions, isolating account failure', async () => {
    function BrokenReader() {
      const session = useSession(accountDefinition);
      useLiveQuery({
        session,
        query: () => {
          throw new Error('Account unavailable');
        },
      });
      return null;
    }
    function MockApp({ broken = false }: { broken?: boolean }) {
      const guest = useMockAggregateSession(guestDefinition, {
        claims: { aggregateId: 'guest' },
      });
      const account = useMockAggregateSession(accountDefinition, {
        claims: { aggregateId: 'account' },
      });
      return (
        <SessionProvider session={guest}>
          <SessionProvider session={account}>
            <SessionReady
              definition={guestDefinition}
              fallback={<p>Opening guest</p>}
              renderError={() => <p>Guest failed</p>}
            >
              <PublicShell />
            </SessionReady>
            <SessionReady
              definition={accountDefinition}
              fallback={<p>Opening account</p>}
              renderError={() => <p>Account failed</p>}
            >
              {broken ? <BrokenReader /> : <Reader />}
            </SessionReady>
          </SessionProvider>
        </SessionProvider>
      );
    }
    await act(async () => root.render(<MockApp />));
    const [guest, account] = sessions;
    if (!guest || !account) throw new Error('Missing mock sessions.');
    await act(async () => {
      guest.ready();
      account.ready();
      account.store.setState({ initialized: { db: {} } });
    });
    const shell = container.querySelector('#public-counter');
    expect(readSession).toBe(account);
    await act(async () => root.render(<MockApp broken />));
    expect(container.textContent).toContain('Account failed');
    expect(container.querySelector('#public-counter')).toBe(shell);
    expect(account.reportFailure).toHaveBeenCalledExactlyOnceWith({
      origin: 'session',
      error: expect.any(Error),
    });
    expect(guest.dispose).not.toHaveBeenCalled();
    expect(constructors.connected).not.toHaveBeenCalled();
  });
});
