import { describe, expect, expectTypeOf, it } from '@effect/vitest';
import { aggregateNodeNetwork } from '@zerospin/browser/AggregateNode/aggregateNodeNetwork';
import { AggregateNodeSynchronization } from '@zerospin/browser/AggregateNode/AggregateNodeSynchronization';
import { makeAggregateNodeDefinition } from '@zerospin/browser/AggregateNode/makeAggregateNodeDefinition';
import {
  makeAggregateNodeUpgradeJournal,
  readAggregateTabJournal,
} from '@zerospin/browser/AggregateNode/recoverAggregateTabJournal';
import { acquireWorkerPort } from '@zerospin/browser/Node/acquireWorkerPort';
import { isNodeAdmissionBackpressure } from '@zerospin/browser/Node/isNodeAdmissionBackpressure';
import { isNodeAdmissionRejected } from '@zerospin/browser/Node/isNodeAdmissionRejected';
import { makeSocketAttempt } from '@zerospin/browser/Node/makeSocketAttempt';
import { makeWorkerConnectionDiagnostics } from '@zerospin/browser/Node/makeWorkerConnectionDiagnostics';
import { makeWorkerConnections } from '@zerospin/browser/Node/makeWorkerConnections';
import {
  NodeBackendTimeoutError,
  NodeBackendUnreachableError,
  NodeFailureSchema,
  NodeStorageOwnerBusyError,
} from '@zerospin/browser/Node/NodeErrors';
import { nodeRpcErrorFor } from '@zerospin/browser/Node/nodeRpcErrorFor';
import {
  publicRpcError,
  restoreRpcError,
} from '@zerospin/browser/Node/publicRpcError';
import { nodeNetworkProgram } from '@zerospin/browser/Node/runNodeNetwork';
import { selectDevelopmentStorage } from '@zerospin/browser/Node/selectDevelopmentStorage';
import { shouldResetConnectedNode } from '@zerospin/browser/Node/shouldResetConnectedNode';
import { waitForDevelopmentSystem } from '@zerospin/browser/Node/waitForDevelopmentSystem';
import { makeConnectedServiceConnection } from '@zerospin/browser/ServiceNode/makeConnectedServiceConnection';
import { makeServiceNodeDefinition } from '@zerospin/browser/ServiceNode/makeServiceNodeDefinition';
import { serviceNodeNetwork } from '@zerospin/browser/ServiceNode/serviceNodeNetwork';
import type { IServiceReplica } from '@zerospin/browser/sessionReplica/replicaConnection';
import { sharedWorkerVersion } from '@zerospin/browser/sharedWorkerVersion';
import { makeStagedCommandJournal } from '@zerospin/browser/stagedCommandJournal/makeStagedCommandJournal';
import { recoverStagedCommands } from '@zerospin/browser/stagedCommandJournal/recoverStagedCommands';
import { makeStandaloneAggregateConnection } from '@zerospin/browser/StandaloneNode/makeStandaloneAggregateConnection';
import { StandaloneSharedWorkerApi } from '@zerospin/browser/StandaloneNode/StandaloneSharedWorkerApi';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import type { IServiceNodeSnapshot } from '@zerospin/core/ServiceNode/ServiceNode';
import { makeServiceSessionDefinition } from '@zerospin/core/serviceSession/make/makeServiceSessionDefinition';
import { makeServiceSessionLock } from '@zerospin/core/serviceSession/make/makeServiceSessionLock';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import {
  encodeError,
  makeZerospinError,
  matchZerospinErrorCode,
  recognizeZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  newHttpBatchRpcResponse,
  newMessagePortRpcSession,
  RpcStub,
  RpcTarget,
} from 'capnweb';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import * as TestClock from 'effect/testing/TestClock';
import { vi } from 'vitest';

describe('Node network errors', () => {
  it('propagates reset and registration errors from an ordered push as typed failures', async () => {
    for (const code of [
      'node-producer-not-registered',
      'node-state-required',
      'node-checkpoint-conflict',
    ] as const) {
      const node = {
        nextPush: async () => {
          throw makeZerospinError(code);
        },
      } as unknown as ConstructorParameters<
        typeof AggregateNodeSynchronization
      >[0];
      const driver = new AggregateNodeSynchronization(
        node,
        {} as ConstructorParameters<typeof AggregateNodeSynchronization>[1],
        { clear: () => {} } as unknown as ConstructorParameters<
          typeof AggregateNodeSynchronization
        >[2],
      );
      driver.resumeProgram = () => Effect.void;
      const result = await Effect.runPromiseExit(driver.pushProgram());
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(Cause.hasFails(result.cause)).toBe(true);
        expect(Cause.hasDies(result.cause)).toBe(false);
        expect(Cause.squash(result.cause)).toMatchObject({ code });
      }
      await driver.stop();
    }
  });
  it('registers local Nodes through the authenticated session and leaves remote connections alone', async () => {
    const registrations = new Set<string>();
    let calls = 0;
    class Session extends RpcTarget {
      registerNode(input: {
        args: readonly [{ nodeId: string; create: boolean }];
      }) {
        const { nodeId, create } = input.args[0];
        calls += 1;
        if (create) registrations.add(nodeId);
        return {
          link: null,
          result: {
            _tag: 'Success' as const,
            success: registrations.has(nodeId) ? 'registered' : 'missing',
          },
        };
      }
    }
    class Admitted extends RpcTarget {
      authorize() {
        return new Session();
      }
    }
    class Owner extends RpcTarget {
      admit() {
        return new Admitted();
      }
    }
    class AuthenticatedActor extends RpcTarget {
      openSession() {
        return new Session();
      }
    }
    class Aggregate extends RpcTarget {
      authenticate() {
        return new AuthenticatedActor();
      }
    }
    class Gateway extends RpcTarget {
      aggregate() {
        return new Aggregate();
      }

      service() {
        return new Owner();
      }
    }
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      newHttpBatchRpcResponse(new Request(input, init), new Gateway()),
    );
    try {
      const aggregate = makeAggregateSessionDefinition({
        systemName: 'test',
        aggregateName: 'account',
        aggregateVersion: 1,
        actorName: 'member',
        actorVersion: 1,
        sessionName: 'reader',
        claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
        models: {},
        contracts: {},
      });
      const service = makeServiceSessionDefinition({
        systemName: 'test',
        serviceName: 'account',
        serviceVersion: 1,
        actorName: 'member',
        actorVersion: 1,
        sessionName: 'reader',
        claimsSchema: Schema.Struct({}),
        models: {},
        contracts: {},
      });
      const aggregateRequest = {
        apiUrl: 'https://zerospin.qrk.localhost',
        publishableKey: 'pk_test',
        systemName: aggregate.systemName,
        aggregateName: aggregate.aggregateName,
        aggregateVersion: aggregate.aggregateVersion,
        sessionName: aggregate.sessionName,
        lock: makeAggregateSessionLock(aggregate),
      };
      const serviceRequest = {
        apiUrl: 'https://zerospin.qrk.localhost',
        publishableKey: 'pk_test',
        systemName: service.systemName,
        serviceName: service.serviceName,
        serviceVersion: service.serviceVersion,
        sessionName: service.sessionName,
        lock: makeServiceSessionLock(service),
      };
      const aggregateNetwork = aggregateNodeNetwork(aggregateRequest, {
        aggregateId: 'account',
        credentials: {},
      });
      const serviceNetwork = serviceNodeNetwork(serviceRequest, { claims: {} });
      for (const network of [aggregateNetwork, serviceNetwork]) {
        expect(await network.register('node_test', false)).toBe('missing');
        expect(await network.register('node_test', true)).toBe('registered');
        expect(await network.register('node_test', false)).toBe('registered');
        registrations.clear();
      }
      expect(calls).toBe(6);
      expect(
        await serviceNodeNetwork(
          { ...serviceRequest, apiUrl: 'https://example.invalid' },
          { claims: {} },
        ).register('node_test', true),
      ).toBe('not-local');
      expect(calls).toBe(6);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('pushes a queued command and recovers when its checkpoint is rejected', async () => {
    const sent: unknown[] = [];

    const hash = '0'.repeat(64);
    class TestSocket extends EventTarget {
      static readonly OPEN = 1;
      static current: TestSocket | undefined;
      readyState = 0;

      constructor(_url: URL) {
        super();
        TestSocket.current = this;
        queueMicrotask(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event('open'));
        });
      }

      send(data: string) {
        const message = JSON.parse(data);
        if (message.type === 'resume') {
          queueMicrotask(() =>
            this.dispatchEvent(
              new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'replay-complete',
                  aggregateIndex: 0,
                  outcomeIndex: 0,
                  dispositionChainHash: hash,
                }),
              }),
            ),
          );
        } else {
          sent.push(message);
        }
      }

      close() {
        this.readyState = 3;
      }
    }
    vi.stubGlobal('WebSocket', TestSocket);
    let synchronization = 'offline';
    const command = {
      id: 'cmd_submit',
      nodeId: 'node_one',
      nodeIndex: 2,
      pushIndex: 2,
      sessionId: 'sesn_one',
      sessionIndex: 2,
      commandName: 'submit',
      contractVersion: 1,
      aggregateId: 'one',
      aggregateName: 'mailbox',
      aggregateVersion: 1,
      kind: 'actor' as const,
      actorName: 'web',
      actorVersion: 1,
      claims: {},
      sessionName: 'web',
      payload: '{}',
      stagingOutcome: { result: null, completedAt: '2026-11-16T00:00:00.000Z' },
    };
    const snapshot = {
      metadata: {
        nodeId: 'node_one',
        aggregateIndex: 0,
        dispositionChainHash: hash,
      },
      outcomeIndex: 0,
    };
    const node = {
      status: () => ({
        synchronization,
        failure: null,
        blockedWork: false,
        admissionRejection: null,
      }),
      connectionState: (value: string) => {
        synchronization = value;
      },
      snapshot: async () => snapshot,
      nextPush: async () => command,
    } as unknown as ConstructorParameters<
      typeof AggregateNodeSynchronization
    >[0];
    const request = { apiUrl: 'https://example.test' } as ConstructorParameters<
      typeof AggregateNodeSynchronization
    >[1];
    const authentication = {
      clear: () => {},
    } as unknown as ConstructorParameters<
      typeof AggregateNodeSynchronization
    >[2];
    const recover = vi.fn(async () => true);
    const driver = new AggregateNodeSynchronization(
      node,
      request,
      authentication,
      recover,
    );
    driver.resumeProgram = () => Effect.void;
    const attempt = makeSocketAttempt(() => true);
    try {
      const open = Reflect.get(driver, 'openSocket');
      if (typeof open !== 'function') throw new Error('Missing socket opener');
      await Reflect.apply(open, driver, [attempt, snapshot, 'ticket']);
      await vi.waitFor(() =>
        expect(sent).toMatchObject([
          { type: 'pushAggregateCommand', command: { id: 'cmd_submit' } },
        ]),
      );
      TestSocket.current!.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'state-required',
            reason: 'checkpoint-conflict',
            requested: { aggregateIndex: 0, dispositionChainHash: hash },
            retainedDispositionChainHash: hash,
            current: { aggregateIndex: 0, dispositionChainHash: hash },
          }),
        }),
      );
      await vi.waitFor(() =>
        expect(recover).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'node-checkpoint-conflict' }),
          'node_one',
        ),
      );
    } finally {
      await attempt.stop();
      await driver.stop();
      vi.unstubAllGlobals();
    }
  });
  it('rescans an older session when another tab publishes its journal later', async () => {
    const entries = new Map<string, string>();
    const storage = {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    };
    vi.stubGlobal('localStorage', storage);
    try {
      const originating = vi.fn();
      const decode = (input: unknown) =>
        Schema.decodeUnknownSync(AggregateNodeCommandSchema)(input);
      const recovery = recoverStagedCommands({
        prefix: 'aggregate',
        sessionId: 'sesn_reader',
        identityKey: () => 'owner',
        decode,
        resolutionIndex: (resolution: {
          id: string;
          commandName: string;
          aggregateIndex: number;
        }) => resolution.aggregateIndex,
        attachment: () => null,
        isActive: () => true,
        originating,
        retained: () => {},
      });
      recovery.bind('node_one');
      await Effect.runPromise(recovery.drain);
      expect(originating).not.toHaveBeenCalled();
      const journal = makeStagedCommandJournal({
        prefix: 'aggregate',
        identityKey: 'owner',
        nodeId: 'node_one',
        decode,
      });
      journal.write({
        id: null,
        nodeId: null,
        nodeIndex: null,
        pushIndex: null,
        sessionId: 'sesn_writer',
        sessionIndex: 1,
        kind: 'actor',
        commandName: 'queue',
        payload: '{}',
        contractVersion: 1,
        aggregateId: 'mailbox',
        aggregateName: 'mailbox',
        aggregateVersion: 1,
        actorName: 'web',
        actorVersion: 1,
        claims: {},
        sessionName: 'web',
        stagingOutcome: {
          result: null,
          completedAt: '2026-11-16T00:00:00.000Z',
        },
      });
      expect(recovery.journalChanged('unrelated')).toBe(false);
      expect(recovery.journalChanged(`${journal.key}changed`)).toBe(true);
      await Effect.runPromise(recovery.drain);
      expect(originating).toHaveBeenCalledOnce();
      expect(originating.mock.calls[0]?.[0]).toMatchObject({
        sessionId: 'sesn_writer',
        sessionIndex: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('passes the original and predecessor coordinates to the worker while preserving the published journal', async () => {
    const request = {
      apiUrl: 'https://history.example',
      publishableKey: 'pk_history',
      systemName: 'history',
      aggregateName: 'mailbox',
      aggregateVersion: 1,
      sessionName: 'web',
      lock: {
        sessionName: 'web',
        origin: { kind: 'actor' as const, actorName: 'web', actorVersion: 1 },
        models: {},
        contracts: {},
      },
    };
    const claims = { aggregateId: 'mailbox' };
    const binding = await makeAggregateNodeDefinition(
      request,
      claims,
      claims.aggregateId,
    );
    const key = `aggregate:${await sessionKey(binding.identity)}:node_original:sesn_writer:2`;
    const saved = JSON.stringify({
      sessionId: 'sesn_writer',
      sessionIndex: 2,
      id: null,
      nodeId: null,
      nodeIndex: null,
      pushIndex: null,
      kind: 'actor',
      commandName: 'move',
      payload: '{}',
      contractVersion: 1,
      aggregateId: 'mailbox',
      aggregateName: 'mailbox',
      aggregateVersion: 1,
      actorName: 'web',
      actorVersion: 1,
      claims,
      sessionName: 'web',
      stagingOutcome: { result: null, completedAt: '2026-11-16T00:00:00.000Z' },
      dependsOn: { sessionId: 'sesn_writer', sessionIndex: 1 },
    });
    const malformedKey = key.replace(/:2$/, ':3');
    const entries = new Map([
      [malformedKey, '{'],
      [key, saved],
    ]);
    vi.stubGlobal('localStorage', {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (name: string) => entries.get(name) ?? null,
      removeItem: (name: string) => entries.delete(name),
    });
    const journal = makeAggregateNodeUpgradeJournal({
      request,
      aggregateId: claims.aggregateId,
      expectedClaims: claims,
      isCurrent: () => true,
    });
    try {
      const visit = vi.fn(async () => {});
      await readAggregateTabJournal(
        journal,
        claims,
        'node_original',
        new AbortController().signal,
        visit,
      );
      expect(visit).toHaveBeenCalledWith([JSON.parse(saved)]);
      await expect(
        journal.read({
          claims,
          nodeId: 'node_original',
          offset: 0,
          requireComplete: true,
        }),
      ).rejects.toThrow();
      expect(entries.get(malformedKey)).toBe('{');
      entries.delete(malformedKey);
      expect(
        await journal.read({
          claims,
          nodeId: 'node_original',
          offset: 0,
          requireComplete: true,
        }),
      ).toEqual({ commands: [JSON.parse(saved)], done: true });
      // A clean can replace this producer between legacy preflight and registration.
      expect(
        await journal.read({ claims, nodeId: 'node_successor', offset: 0 }),
      ).toEqual({ commands: [], done: true });
      await expect(
        journal.read({ claims, nodeId: 'node_original', offset: 0 }),
      ).rejects.toThrow();
      await expect(
        journal.acknowledge([
          {
            nodeId: 'node_original',
            nodeIndex: 1,
            pushIndex: 1,
            sessionId: 'sesn_writer',
            sessionIndex: 2,
          },
        ]),
      ).rejects.toThrow();
      expect(entries.get(key)).toBe(saved);
    } finally {
      journal[Symbol.dispose]();
      vi.unstubAllGlobals();
    }
  });
  it('snapshots upgrade journals before acknowledgements and tolerates failed key deletion', () => {
    const entries = new Map<string, string>();
    const storage = {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: vi.fn((key: string) => {
        entries.delete(key);
      }),
    };
    vi.stubGlobal('localStorage', storage);
    try {
      const journal = makeStagedCommandJournal({
        prefix: 'aggregate',
        identityKey: 'identity',
        nodeId: 'node_original',
        decode: Schema.decodeUnknownSync(
          Schema.Struct({
            sessionId: Schema.String,
            sessionIndex: Schema.Number,
            id: Schema.Null,
            nodeId: Schema.Null,
            nodeIndex: Schema.Null,
            pushIndex: Schema.Null,
            payload: Schema.String,
          }),
          { onExcessProperty: 'error' },
        ),
      });
      for (const sessionIndex of [3, 1, 2]) {
        journal.write({
          sessionId: 'session',
          sessionIndex,
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          payload: `original-${sessionIndex}`,
        });
      }
      entries.set('other-identity', 'unrelated');
      const snapshot = journal.readForUpgrade();
      expect(snapshot.map(command => command.sessionIndex)).toEqual([1, 2, 3]);
      for (const command of snapshot.slice(0, 1)) journal.remove(command);
      expect(snapshot.slice(1).map(command => command.payload)).toEqual([
        'original-2',
        'original-3',
      ]);
      expect(
        journal.readForUpgrade().map(command => command.sessionIndex),
      ).toEqual([2, 3]);
      storage.removeItem.mockImplementationOnce(() => {
        throw new Error('Deletion denied');
      });
      for (const command of snapshot.slice(1, 2)) journal.remove(command);
      expect(
        journal.readForUpgrade().map(command => command.sessionIndex),
      ).toEqual([2, 3]);
      expect(entries.get('other-identity')).toBe('unrelated');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('refuses malformed, mismatched or unreadable matching upgrade journals without deleting them', () => {
    const entries = new Map<string, string>();
    const storage = {
      get length() {
        return entries.size;
      },
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    };
    vi.stubGlobal('localStorage', storage);
    try {
      const journal = makeStagedCommandJournal({
        prefix: 'service',
        identityKey: 'identity',
        nodeId: 'node_original',
        decode: Schema.decodeUnknownSync(
          Schema.Struct({
            sessionId: Schema.String,
            sessionIndex: Schema.Number,
            id: Schema.Null,
            nodeId: Schema.Null,
            nodeIndex: Schema.Null,
            pushIndex: Schema.Null,
          }),
          { onExcessProperty: 'error' },
        ),
      });
      const key = `${journal.key}session:1`;
      for (const serialized of [
        '{malformed',
        JSON.stringify({
          sessionId: 'session',
          sessionIndex: 2,
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
        }),
      ]) {
        entries.set(key, serialized);
        expect(() => journal.readForUpgrade()).toThrow(
          expect.objectContaining({
            code: 'node-storage-upgrade-journal-invalid',
          }),
        );
        expect(entries.get(key)).toBe(serialized);
      }
      expect(journal.read()).toEqual([]);
      storage.getItem.mockImplementationOnce(() => {
        throw new Error('Read denied');
      });
      expect(() => journal.readForUpgrade()).toThrow(
        expect.objectContaining({
          code: 'node-storage-upgrade-journal-invalid',
        }),
      );
      expect(entries.size).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('registers standalone recovery notices before attachment and releases failed first attachments', async () => {
    const warning = Effect.runSync(
      encodeError(makeZerospinError('standalone-state-reset')),
    );
    const recipients = new Set<(error: IZerospinErrorJson) => Promise<void>>();
    const received = vi.fn();
    const notice = new RpcStub(async (error: IZerospinErrorJson) => {
      received(error);
    });
    const api = new StandaloneSharedWorkerApi(
      async () => {
        expect(recipients.size).toBe(1);
        await Promise.all([...recipients].map(notify => notify(warning)));
        throw makeZerospinError('node-execution-checkpoint-invalid');
      },
      () => Effect.void,
      () => Effect.succeed({ status: 'empty' }),
      Promise.resolve(),
      notify => {
        recipients.add(notify);
        return () => {
          recipients.delete(notify);
        };
      },
    );
    try {
      const request = {
        sessionName: 'draft',
        pattern: '/draft',
        path: '/draft',
        claims: {},
      };
      await expect(api.attach(request, notice)).rejects.toMatchObject({
        code: 'node-execution-checkpoint-invalid',
      });
      expect(received).toHaveBeenCalledExactlyOnceWith(warning);
      expect(recipients.size).toBe(0);
    } finally {
      api[Symbol.dispose]();
      notice[Symbol.dispose]();
    }
  });

  it.effect(
    'restores a specific standalone reset notice during the first attach RPC',
    () =>
      Effect.gen(function* () {
        const channel = new MessageChannel();
        const warning = yield* encodeError(
          makeZerospinError('standalone-state-reset'),
        );
        const received = vi.fn();
        let server: ReturnType<typeof newMessagePortRpcSession> | undefined;
        class OwnerApi extends RpcTarget {
          ready() {
            return {
              version: sharedWorkerVersion,
              artifactUrl: 'https://worker.example/entry.js',
            };
          }

          async attach(
            _request: unknown,
            notice: RpcStub<(error: IZerospinErrorJson) => Promise<void>>,
          ) {
            await notice(warning);
            throw makeZerospinError('node-execution-checkpoint-invalid');
          }
        }
        const bootstrap = (event: MessageEvent) => {
          if (event.data?.type !== 'zerospin-client') return;
          channel.port2.removeEventListener('message', bootstrap);
          channel.port2.postMessage({
            type: 'zerospin-client-accepted',
            clientId: event.data.clientId,
          });
          server = newMessagePortRpcSession(channel.port2, new OwnerApi(), {
            onSendError: publicRpcError,
          });
        };
        channel.port2.addEventListener('message', bootstrap);
        channel.port2.start();
        class Worker extends EventTarget {
          port = channel.port1;
        }
        vi.stubGlobal('SharedWorker', Worker);
        vi.stubGlobal('location', { href: 'https://worker.example/' });
        vi.stubGlobal('navigator', {
          locks: {
            request: (
              name: string,
              options: { signal: AbortSignal },
              callback: () => unknown,
            ) =>
              name.startsWith('zerospin:worker-client:')
                ? Promise.resolve().then(callback)
                : new Promise<void>(resolve => {
                    // The active owner holds this lock; its loss callback must wait.
                    options.signal.addEventListener('abort', () => resolve(), {
                      once: true,
                    });
                  }),
          },
        });
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            server?.[Symbol.dispose]();
            channel.port1.close();
            channel.port2.close();
            vi.unstubAllGlobals();
          }),
        );
        const connection = makeStandaloneAggregateConnection({
          key: 'draft-notice',
          attachment: {},
          sharedWorkerUrl: '/entry.js',
          signal: new AbortController().signal,
          onProtocolFailure: () => {},
        });
        const result = yield* connection
          .start({
            pendingCommands: () => [],
            view: async () => {},
            reset: async () => {},
            recoveryWarning: received,
            state: () => {},
            attachmentReady: async () => {},
            connectionFailed: () => {},
          })
          .pipe(Effect.exit);
        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          expect(Cause.squash(result.cause)).toMatchObject({
            code: 'node-execution-checkpoint-invalid',
          });
        }
        expect(received).toHaveBeenCalledExactlyOnceWith({
          error: expect.objectContaining({
            code: 'standalone-state-reset',
            message: warning.message,
          }),
        });
        expect(received.mock.calls[0]?.[0].error).toBeInstanceOf(Error);
      }),
  );

  it('bounds connected recovery in every environment while preserving transport and identity failures', () => {
    for (const failure of [
      makeZerospinError('node-checkpoint-conflict'),
      makeZerospinError('node-producer-not-registered'),
      makeZerospinError('node-storage-reset-required'),
      makeZerospinError('node-synchronization-failed'),
      new Error('Unreadable retained SQLite'),
    ]) {
      expect(shouldResetConnectedNode({ failure, attempted: false })).toBe(
        true,
      );
      expect(shouldResetConnectedNode({ failure, attempted: true })).toBe(
        false,
      );
    }
    for (const code of [
      'authentication-credentials-invalid',
      'node-authentication-rejected',
      'node-backend-timeout',
      'node-backend-unreachable',
      'node-storage-owner-busy',
      'node-storage-runtime-unavailable',
      'node-subscription-closed',
      'node-subscription-timeout',
      'node-storage-identity-mismatch',
      'node-authentication-cancelled',
      'node-storage-upgrade-newer',
      'node-storage-upgrade-ledger-missing',
      'node-storage-upgrade-history-invalid',
      'node-storage-upgrade-schema-mismatch',
      'node-storage-upgrade-migration-failed',
      'node-storage-upgrade-journal-invalid',
      'node-storage-upgrade-predecessor-pending',
    ]) {
      expect(
        shouldResetConnectedNode({
          failure: makeZerospinError(code),
          attempted: false,
        }),
      ).toBe(false);
    }
  });
  it('waits for the local CLI to accept its System before authenticating again', async () => {
    const starting = makeZerospinError({
      code: 'node-development-system-starting',
      status: 503,
    });
    const generic = makeZerospinError({
      code: 'authentication-unavailable',
      status: 503,
    });
    const signal = new AbortController().signal;
    let calls = 0;
    const proof = await waitForDevelopmentSystem(
      'https://worker.localhost',
      signal,
      async () => {
        calls += 1;
        if (calls === 1) throw starting;
        return 'verified history';
      },
    );
    expect(proof).toBe('verified history');
    expect(calls).toBe(2);
    for (const [endpoint, error] of [
      ['https://worker.example.com', starting],
      ['https://worker.localhost', generic],
    ] as const) {
      let attempts = 0;
      await expect(
        waitForDevelopmentSystem(endpoint, signal, async () => {
          attempts++;
          return Promise.reject(error);
        }),
      ).rejects.toBe(error);
      expect(attempts).toBe(1);
    }
    const unavailable = makeZerospinError('node-backend-unreachable');
    let probes = 0;
    const probe = async () => {
      if (++probes === 1) throw unavailable;
      return 'authenticated successor';
    };
    await expect(
      waitForDevelopmentSystem('https://worker.localhost', signal, probe),
    ).rejects.toBe(unavailable);
    probes = 0;
    await expect(
      waitForDevelopmentSystem('https://worker.example.com', signal, probe, {
        verifiedHistoryId: 'old-history',
      }),
    ).rejects.toBe(unavailable);
    probes = 0;
    await expect(
      waitForDevelopmentSystem('https://worker.localhost', signal, probe, {
        verifiedHistoryId: 'old-history',
      }),
    ).resolves.toBe('authenticated successor');
    expect(probes).toBe(2);
    let expiredAttempts = 0;
    await expect(
      waitForDevelopmentSystem(
        'https://worker.localhost',
        signal,
        async () => {
          expiredAttempts++;
          throw starting;
        },
        { timeoutMs: 5 },
      ),
    ).rejects.toBe(starting);
    expect(expiredAttempts).toBe(1);
    const controller = new AbortController();
    let abortedAttempts = 0;
    const waiting = waitForDevelopmentSystem(
      'https://worker.localhost',
      controller.signal,
      async () => {
        abortedAttempts++;
        queueMicrotask(() => controller.abort());
        throw starting;
      },
    );
    await expect(waiting).rejects.toMatchObject({ code: 'node-tab-detached' });
    expect(abortedAttempts).toBe(1);
    expect(
      shouldResetConnectedNode({ failure: starting, attempted: false }),
    ).toBe(false);
  });

  it('keeps Chain admission backpressure retryable without rejecting Node authority', () => {
    for (const code of [
      'aggregate-admission-backlog-full',
      'service-admission-backlog-full',
    ]) {
      const failure = makeZerospinError({ code, extra: { retryable: true } });
      expect(
        isNodeAdmissionBackpressure(Effect.runSync(encodeError(failure))),
      ).toBe(true);
      expect(isNodeAdmissionRejected(failure)).toBe(false);
      expect(
        isNodeAdmissionBackpressure({ code, extra: { retryable: false } }),
      ).toBe(false);
    }
  });
  it.effect(
    'attributes the ten-second backend deadline and removes private URL fields',
    () =>
      Effect.gen(function* () {
        const fiber = yield* nodeNetworkProgram(Effect.never, {
          endpoint:
            'https://user:secret@zerospin.test/rpc?token=secret#private',
          operation: 'getSnapshot',
        }).pipe(Effect.forkChild);
        yield* TestClock.adjust('9999 millis');
        expect(fiber.pollUnsafe()).toBeUndefined();
        yield* TestClock.adjust('1 millis');
        const failure = yield* Effect.flip(Fiber.join(fiber));
        expect(Schema.is(Schema.toType(NodeBackendTimeoutError))(failure)).toBe(
          true,
        );
        expect(failure.message).toBe(
          'Backend is not responding. Try again shortly.',
        );
        expect(failure.extra).toEqual({
          endpoint: 'https://zerospin.test/rpc',
          operation: 'getSnapshot',
          timeoutMs: 10_000,
        });
      }),
  );

  it.effect(
    'classifies only recognized transport failures and preserves rejections and defects',
    () =>
      Effect.gen(function* () {
        const request = {
          endpoint: 'https://zerospin.test',
          operation: 'createWebSocketTicket' as const,
        };
        const unreachable = yield* nodeNetworkProgram(
          Effect.fail(
            makeZerospinError({
              code: 'rpc-invocation-failed',
              extra: { networkUnavailable: true },
            }),
          ),
          request,
        ).pipe(Effect.flip);
        expect(
          Schema.is(Schema.toType(NodeBackendUnreachableError))(unreachable),
        ).toBe(true);
        expect(unreachable.extra).toEqual(request);

        for (const failure of [
          makeZerospinError('authentication-credentials-invalid'),
          makeZerospinError('rpc-invalid-response'),
          makeZerospinError('rpc-invocation-failed'),
        ]) {
          const retained = yield* nodeNetworkProgram(
            Effect.fail(failure),
            request,
          ).pipe(Effect.flip);
          expect(retained.code).toBe(failure.code);
          expect(retained.message).toBe(failure.message);
        }
        const defect = new TypeError('Unexpected application failure');
        const exit = yield* Effect.exit(
          nodeNetworkProgram(Effect.die(defect), request),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBe(true);
          expect(Cause.squash(exit.cause)).toBe(defect);
        }
      }),
  );

  it.effect(
    'retains typed diagnostics through worker RPC and refuses malformed known failures',
    () =>
      Effect.gen(function* () {
        const failure = NodeBackendTimeoutError.make({
          cause: 'private cause',
          extra: {
            endpoint: 'https://zerospin.test',
            operation: 'getSnapshot',
            timeoutMs: 10_000,
          },
        });
        const publicFailure = publicRpcError(failure);
        expect('stack' in publicFailure).toBe(false);
        expect('cause' in publicFailure).toBe(false);
        expect('scope' in publicFailure).toBe(false);
        const restored = yield* Effect.try({
          try: () => restoreRpcError(publicFailure),
          catch: nodeRpcErrorFor(['node-backend-timeout']),
        }).pipe(Effect.flip);
        expect(
          Schema.is(Schema.toType(NodeBackendTimeoutError))(restored),
        ).toBe(true);
        const encoded = yield* encodeError(restored);
        const timeoutMs = matchZerospinErrorCode({
          failure: recognizeZerospinError(NodeFailureSchema, encoded),
          onMatch: {
            'node-backend-timeout': error => {
              expectTypeOf(error.extra.timeoutMs).toEqualTypeOf<number>();
              expectTypeOf(error.extra.operation).toEqualTypeOf<
                'getSnapshot' | 'createWebSocketTicket' | 'registerNode'
              >();
              return error.extra.timeoutMs;
            },
          },
          onUnknown: () => -1,
        });
        expect(timeoutMs).toBe(10_000);

        const busy = NodeStorageOwnerBusyError.make({
          extra: { timeoutMs: 15_000 },
        });
        const restoredBusy = yield* Effect.try({
          try: () => restoreRpcError(publicRpcError(busy)),
          catch: nodeRpcErrorFor(['node-storage-owner-busy']),
        }).pipe(Effect.flip);
        expect(
          Schema.is(Schema.toType(NodeStorageOwnerBusyError))(restoredBusy),
        ).toBe(true);
        expect(restoredBusy.message).toBe(busy.message);
        expect(restoredBusy.extra).toEqual({ timeoutMs: 15_000 });
        const malformedBusy = makeZerospinError({
          code: 'node-storage-owner-busy',
          extra: { timeoutMs: -1 },
        });
        expect(() =>
          nodeRpcErrorFor(['node-storage-owner-busy'])(malformedBusy),
        ).toThrow(malformedBusy);

        for (const payload of [
          { ...failure.toJson(), scope: 'actor' },
          { ...failure.toJson(), unexpected: true },
        ]) {
          let restoredPayload: unknown;
          try {
            restoreRpcError(payload);
          } catch (error) {
            restoredPayload = error;
          }
          expect(restoredPayload).toBe(payload);
          expect(
            Schema.is(Schema.toType(NodeBackendTimeoutError))(restoredPayload),
          ).toBe(false);
          let retainedPayload: unknown;
          try {
            nodeRpcErrorFor(['node-backend-timeout'])(restoredPayload);
          } catch (error) {
            retainedPayload = error;
          }
          expect(retainedPayload).toBe(payload);
        }

        const malformed = makeZerospinError({
          code: 'node-backend-timeout',
          extra: {
            endpoint: 'https://zerospin.test?token=private',
            operation: 'getSnapshot',
            timeoutMs: -1,
          },
        });
        expect(() =>
          nodeRpcErrorFor(['node-backend-timeout'])(malformed),
        ).toThrow(malformed);
        const unknown = recognizeZerospinError(
          NodeFailureSchema,
          yield* encodeError(malformed),
        );
        expect(
          matchZerospinErrorCode({
            failure: unknown,
            onMatch: { 'node-backend-timeout': () => 'recognized' },
            onUnknown: () => 'unknown',
          }),
        ).toBe('unknown');
      }),
  );
});

// Native transport timers/events are controlled here; these assertions do not
// establish real browser module loading or storage behavior.
describe('SharedWorker connection diagnostics', () => {
  it('snapshots a single bounded failure without exposing private URL fields or arbitrary error data', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const diagnostics = makeWorkerConnectionDiagnostics({
        sharedWorkerUrl:
          'https://name:secret@worker.example/entry.js?token=secret#private',
        sessionName: 'account',
      });
      diagnostics.clientId = 'client_diagnostic';
      diagnostics.step('worker.construct');
      diagnostics.complete('worker.construct');
      diagnostics.step('client.bootstrap');
      const original = Object.assign(
        new Error(
          'Module failed at https://name:secret@worker.example/module.js?token=secret#private and HTTPS://name:secret@worker.example/upper.js?token=secret#private and /entry.js?signature=relative-secret#fragment',
        ),
        {
          credentials: { token: 'never-log-this' },
          claims: { userId: 'never-log-this' },
        },
      );
      original.stack = `${original.stack ?? ''}\n${'x'.repeat(20000)}`;
      diagnostics.fail({ reason: 'worker-error', error: original });
      diagnostics.fail({ reason: 'rpc-disconnected', error: original });
      expect(errors).toHaveBeenCalledTimes(1);
      expect(info).not.toHaveBeenCalled();
      const encoded = errors.mock.calls[0]?.[1];
      if (typeof encoded !== 'string') {
        throw new Error('Expected an eagerly serialized diagnostic');
      }
      const record = JSON.parse(encoded);
      expect(record).toMatchObject({
        scope: 'page',
        clientId: 'client_diagnostic',
        sharedWorkerUrl: 'https://worker.example/entry.js',
        phase: 'client.bootstrap',
        lastCompletedPhase: 'worker.construct',
        reason: 'worker-error',
      });
      expect(record.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(record.error).toContain('Error');
      expect(record.error).not.toContain('Module failed');
      expect(record.error.length).toBeLessThanOrEqual(8192);
      expect(encoded).not.toContain('secret');
      expect(encoded).not.toContain('never-log-this');
      expect(encoded).not.toContain('credentials');
      expect(encoded).not.toContain('claims');
      expect(encoded).not.toContain('signature=');
      expect(encoded).not.toContain('relative-secret');
      const unreadable = makeWorkerConnectionDiagnostics({
        sharedWorkerUrl: 'https://worker.example/entry.js',
        sessionName: 'account',
      });
      unreadable.step('worker.construct');
      unreadable.fail({
        reason: 'constructor-failed',
        error: Object.defineProperty(
          new Error('Private error details'),
          'cause',
          {
            get() {
              throw new Error('Cause getter failed');
            },
          },
        ),
      });
      expect(errors).toHaveBeenCalledTimes(2);
      const unavailableDetails = errors.mock.calls[1]?.[1];
      if (typeof unavailableDetails !== 'string') {
        throw new Error(
          'Expected base diagnostics despite inaccessible error details',
        );
      }
      expect(JSON.parse(unavailableDetails)).toMatchObject({
        reason: 'constructor-failed',
        phase: 'worker.construct',
        error: '[Error details unavailable]',
      });
      expect(() => {
        errors.mockImplementation(() => {
          throw new Error('Console unavailable');
        });
        const contained = makeWorkerConnectionDiagnostics({
          sharedWorkerUrl: '/worker.js',
          sessionName: 'account',
          verbose: true,
          recordPhase: () => {
            throw new Error('Collector closed');
          },
        });
        contained.step('worker.construct');
        contained.complete('worker.construct');
        contained.fail({ reason: 'constructor-failed', error: original });
      }).not.toThrow();
    } finally {
      errors.mockRestore();
      info.mockRestore();
    }
  });

  it('summarizes private validation failures and causes without copying their input or arbitrary labels', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const privateEmail = 'private-person@example.invalid';
      const decoded = Schema.decodeUnknownResult(Schema.Number, {
        reportInput: true,
      })(privateEmail);
      if (!Result.isFailure(decoded)) {
        throw new Error('Expected a private validation failure');
      }
      const schemaError = decoded.failure;
      expect(schemaError.message).toContain(privateEmail);
      const wrapped = new Error(`Cannot load ${privateEmail}`, {
        cause: schemaError,
      });
      wrapped.stack = `${privateEmail}\n${'x'.repeat(20000)}`;
      const formatted = `SchemaError: Cannot load ${privateEmail}`;
      const known = makeZerospinError({
        code: 'node-execution-checkpoint-invalid',
        message: privateEmail,
        cause: formatted,
      });
      const unknown = Object.assign(new Error(privateEmail), {
        code: privateEmail,
        name: privateEmail,
      });
      const event = Object.assign(new Event('error'), {
        message: privateEmail,
      });
      let codeReads = 0;
      const changingCode = Object.defineProperty(
        new Error(privateEmail),
        'code',
        {
          get: () => (++codeReads <= 2 ? known.code : privateEmail),
        },
      );
      let typeReads = 0;
      const changingEvent = Object.defineProperty(new Event('error'), 'type', {
        get: () => (++typeReads <= 2 ? 'error' : privateEmail),
      });
      for (const failure of [
        { error: schemaError, schemaFailure: true, errorCode: null },
        { error: wrapped, schemaFailure: true, errorCode: null },
        {
          error: Cause.fail(schemaError),
          schemaFailure: true,
          errorCode: null,
        },
        { error: Cause.die(wrapped), schemaFailure: true, errorCode: null },
        {
          error: new Error(privateEmail, { cause: formatted }),
          schemaFailure: false,
          errorCode: null,
        },
        { error: formatted, schemaFailure: false, errorCode: null },
        { error: unknown, schemaFailure: false, errorCode: null },
        { error: known, schemaFailure: false, errorCode: known.code },
        {
          error: NodeStorageOwnerBusyError.make({
            extra: { timeoutMs: 15_000 },
          }),
          schemaFailure: false,
          errorCode: 'node-storage-owner-busy',
        },
        {
          error: changingCode,
          schemaFailure: false,
          errorCode: known.code,
          event: changingEvent,
        },
      ]) {
        errors.mockClear();
        const recordPhase = vi.fn();
        const diagnostics = makeWorkerConnectionDiagnostics({
          sharedWorkerUrl: 'https://worker.example/entry.js?token=secret',
          sessionName: 'account',
          verbose: true,
          recordPhase,
        });
        diagnostics.step('replica.delivery');
        diagnostics.fail({
          reason: 'exception',
          error: failure.error,
          event: failure.event ?? event,
        });
        expect(errors).toHaveBeenCalledTimes(1);
        const encoded = errors.mock.calls[0]?.[1];
        if (typeof encoded !== 'string') {
          throw new Error('Expected a private failure summary');
        }
        const record = JSON.parse(encoded);
        expect(encoded).not.toContain(privateEmail);
        expect(encoded).not.toContain('Cannot load');
        expect(encoded).not.toContain('secret');
        expect(encoded.length).toBeLessThanOrEqual(16384);
        expect(record.event).not.toHaveProperty('message');
        if (failure.error === changingCode) {
          expect(record.event.type).toBe('error');
        }
        if (failure.schemaFailure) {
          expect(record.error).toContain(
            'SchemaError: Session data failed validation',
          );
        }
        if (failure.errorCode !== null) {
          expect(record.error).toContain(failure.errorCode);
        }
        expect(recordPhase).toHaveBeenCalledExactlyOnceWith(
          'replica.delivery',
          expect.any(Number),
          'failure',
          failure.errorCode,
        );
      }
      expect(wrapped.message).toContain(privateEmail);
      expect(wrapped.cause).toBe(schemaError);
      expect(known.message).toBe(privateEmail);
    } finally {
      errors.mockRestore();
    }
  });

  it.effect(
    'distinguishes startup, transport, and terminal replica failures with a fresh acquisition ID on retry',
    () =>
      Effect.gen(function* () {
        const ids: string[] = [];
        for (const reason of [
          'startup-timeout',
          'worker-error',
          'message-error',
          'view-rejected',
        ] as const) {
          yield* Effect.scoped(
            Effect.gen(function* () {
              const errors = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {});
              const info = vi
                .spyOn(console, 'info')
                .mockImplementation(() => {});
              vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
              const channel = new MessageChannel();
              let server:
                | ReturnType<typeof newMessagePortRpcSession>
                | undefined;
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  server?.[Symbol.dispose]();
                  channel.port1.close();
                  channel.port2.close();
                  vi.useRealTimers();
                  vi.unstubAllGlobals();
                  errors.mockRestore();
                  info.mockRestore();
                }),
              );
              const constructed = Promise.withResolvers<void>();
              const privateEmail = 'private-person@example.invalid';
              class WorkerError extends Event {
                error = null;
                message = `Worker failed for ${privateEmail}`;
                filename =
                  'https://name:secret@worker.example/module.js?token=secret#private';
                lineno = 12;
                colno = 3;
              }
              const workers: { worker: EventTarget; port: MessagePort }[] = [];
              class Worker extends EventTarget {
                port = channel.port1;

                constructor() {
                  super();
                  workers.push({ worker: this, port: this.port });
                  constructed.resolve();
                }
              }
              vi.stubGlobal('SharedWorker', Worker);
              vi.stubGlobal('ErrorEvent', WorkerError);
              vi.stubGlobal('location', { href: 'https://worker.example/' });
              vi.stubGlobal('navigator', {
                onLine: true,
                locks: {
                  request: (
                    name: string,
                    options: { signal: AbortSignal },
                    callback: () => unknown,
                  ) =>
                    name.startsWith('zerospin:worker-client:')
                      ? Promise.resolve().then(callback)
                      : new Promise<void>(resolve => {
                          // The active Node owns this lock until the tab releases it.
                          options.signal.addEventListener(
                            'abort',
                            () => resolve(),
                            { once: true },
                          );
                        }),
                },
              });
              vi.stubGlobal('window', new EventTarget());
              vi.stubGlobal(
                'document',
                Object.assign(new EventTarget(), {
                  visibilityState: 'visible',
                }),
              );
              const definition = makeServiceSessionDefinition({
                systemName: 'diagnostic',
                serviceName: 'account',
                serviceVersion: 1,
                actorName: 'member',
                actorVersion: 1,
                sessionName: 'account',
                claimsSchema: Schema.Struct({}),
                models: {},
                contracts: {},
              });
              const request = {
                apiUrl: 'https://backend.invalid',
                publishableKey: 'never-log-this',
                systemName: definition.systemName,
                serviceName: definition.serviceName,
                serviceVersion: definition.serviceVersion,
                sessionName: definition.sessionName,
                lock: makeServiceSessionLock(definition),
              };
              if (reason === 'view-rejected') {
                const nodeDefinition = yield* Effect.promise(() =>
                  makeServiceNodeDefinition(request, {}),
                );
                const snapshot: IServiceNodeSnapshot = {
                  identity: nodeDefinition.identity,
                  metadata: {
                    nodeId: 'node_diagnostic',
                    sessionKey: yield* Effect.promise(() =>
                      sessionKey(nodeDefinition.identity),
                    ),
                    admittedThroughPushIndex: 0,
                    serviceIndex: 0,
                    dispositionChainHash: '0'.repeat(64),
                    pushPaused: false,
                  },
                  state: {
                    localAvailability: 'available',
                    authentication: 'verified',
                    synchronization: 'online',
                    blockedWork: false,
                    admissionRejection: null,
                    failure: null,
                  },
                  nodeIndex: 0,
                  pushIndex: 0,
                  outcomeIndex: 0,
                  resources: [],
                  commandCoverage: [],
                };
                class NodeApi extends RpcTarget {
                  async subscribe(
                    _input: unknown,
                    sink: RpcStub<{
                      view(snapshot: IServiceNodeSnapshot): Promise<void>;
                    }>,
                  ) {
                    await sink.view(snapshot);
                  }
                }
                class OwnerApi extends RpcTarget {
                  ready() {
                    return {
                      version: sharedWorkerVersion,
                      artifactUrl:
                        'https://worker.example/account.worker.js?token=secret',
                    };
                  }

                  attach() {
                    return new RpcStub(new NodeApi());
                  }
                }
                const bootstrap = (event: MessageEvent) => {
                  if (event.data?.type !== 'zerospin-client') return;
                  channel.port2.removeEventListener('message', bootstrap);
                  channel.port2.postMessage({
                    type: 'zerospin-client-accepted',
                    clientId: event.data.clientId,
                  });
                  server = newMessagePortRpcSession(
                    channel.port2,
                    new OwnerApi(),
                    { onSendError: publicRpcError },
                  );
                };
                channel.port2.addEventListener('message', bootstrap);
                channel.port2.start();
              }
              const controller = new AbortController();
              const original = makeZerospinError(
                'node-execution-checkpoint-invalid',
              );
              const protocolFailed = vi.fn((_error: unknown) =>
                controller.abort(),
              );
              const connection = makeConnectedServiceConnection({
                signal: controller.signal,
                sharedWorkerUrl: '/account.worker.js?token=secret',
                request,
                getAdmission: () =>
                  Promise.reject(
                    new Error('Admission must not run before bootstrap'),
                  ),
                onProtocolFailure: protocolFailed,
              });
              const replica: IServiceReplica = {
                pendingCommands: () => [],
                view: async () => {
                  if (reason === 'view-rejected') throw original;
                },
                reset: async () => {},
                recoveryWarning: () => {},
                state: () => {},
                attachmentReady: async () => {},
                connectionFailed: () => {},
              };
              const fiber = yield* connection
                .start(replica)
                .pipe(Effect.scoped, Effect.exit, Effect.forkChild);
              yield* Effect.promise(() => constructed.promise);
              const active = workers[0];
              if (active === undefined) {
                throw new Error('Expected a constructed worker');
              }
              if (reason === 'startup-timeout') {
                yield* Effect.promise(() => vi.advanceTimersByTimeAsync(15000));
              } else if (reason === 'worker-error') {
                active.worker.dispatchEvent(new WorkerError('error'));
              } else if (reason === 'message-error') {
                active.port.dispatchEvent(new Event('messageerror'));
              }
              const result = yield* Fiber.join(fiber);
              expect(Exit.isFailure(result)).toBe(true);
              expect(errors).toHaveBeenCalledTimes(1);
              expect(info).not.toHaveBeenCalled();
              const encoded = errors.mock.calls[0]?.[1];
              if (typeof encoded !== 'string') {
                throw new Error('Expected a diagnostic');
              }
              const record = JSON.parse(encoded);
              expect(record).toMatchObject({
                reason: reason === 'view-rejected' ? 'exception' : reason,
                phase:
                  reason === 'view-rejected'
                    ? 'replica.delivery'
                    : 'client.bootstrap',
                lastCompletedPhase:
                  reason === 'view-rejected'
                    ? 'node.attachment'
                    : 'worker.construct',
              });
              if (reason === 'view-rejected') {
                expect(protocolFailed).toHaveBeenCalledExactlyOnceWith(
                  original,
                );
                expect(record.error).toContain(original.code);
              }
              expect(typeof record.clientId).toBe('string');
              ids.push(record.clientId);
              expect(encoded).not.toContain('secret');
              expect(encoded).not.toContain('never-log-this');
              expect(encoded).not.toContain(privateEmail);
              if (reason === 'startup-timeout') {
                expect(record.timeoutMs).toBe(15000);
              }
              if (reason === 'worker-error') {
                expect(record.event).toMatchObject({
                  type: 'error',
                  filename: 'https://worker.example/module.js',
                  lineno: 12,
                  colno: 3,
                });
                expect(record.event).not.toHaveProperty('message');
              }
            }),
          );
        }
        expect(new Set(ids).size).toBe(4);
      }),
  );

  it.effect(
    'keeps cancellation quiet, classifies bootstrap refusals, and makes successful phases opt-in',
    () =>
      Effect.promise(async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        try {
          let reply:
            | 'pending'
            | 'accepted'
            | 'rejected'
            | 'invalid'
            | 'mismatch' = 'pending';
          let posted = Promise.withResolvers<void>();
          class Port extends EventTarget {
            start() {
              return undefined;
            }

            close() {
              return undefined;
            }

            postMessage(input: { clientId: string }) {
              posted.resolve();
              if (reply === 'pending') return;
              const data =
                reply === 'invalid'
                  ? { credentials: 'never-log-this' }
                  : {
                      type:
                        reply === 'rejected'
                          ? 'zerospin-client-rejected'
                          : 'zerospin-client-accepted',
                      clientId:
                        reply === 'mismatch'
                          ? crypto.randomUUID()
                          : input.clientId,
                    };
              queueMicrotask(() =>
                this.dispatchEvent(new MessageEvent('message', { data })),
              );
            }
          }
          class Worker extends EventTarget {
            port = new Port();
          }
          vi.stubGlobal('SharedWorker', Worker);
          vi.stubGlobal('ErrorEvent', Event);
          vi.stubGlobal('location', { href: 'https://worker.example/' });
          vi.stubGlobal('navigator', {
            locks: {
              request: (
                _name: string,
                _options: unknown,
                callback: () => unknown,
              ) => Promise.resolve().then(callback),
            },
          });
          const controller = new AbortController();
          const canceled = acquireWorkerPort({
            sharedWorkerUrl: '/worker.js',
            name: 'canceled',
            signal: controller.signal,
            onError: () => {},
          }).then(
            () => null,
            error => error,
          );
          await posted.promise;
          controller.abort();
          expect(await canceled).toMatchObject({ code: 'node-tab-detached' });
          expect(errors).not.toHaveBeenCalled();
          for (const [mode, reason, code] of [
            ['invalid', 'invalid-client-reply', 'node-connection-unavailable'],
            [
              'mismatch',
              'client-reply-mismatch',
              'node-connection-unavailable',
            ],
            ['rejected', 'client-rejected', 'node-connection-release-failed'],
          ] as const) {
            reply = mode;
            errors.mockClear();
            const failure = await acquireWorkerPort({
              sharedWorkerUrl: '/worker.js',
              name: mode,
              signal: new AbortController().signal,
              onError: () => {},
            }).then(
              () => null,
              error => error,
            );
            expect(failure).toMatchObject({ code });
            expect(errors).toHaveBeenCalledTimes(1);
            const encoded = errors.mock.calls[0]?.[1];
            if (typeof encoded !== 'string') {
              throw new Error('Expected a diagnostic');
            }
            expect(JSON.parse(encoded)).toMatchObject({
              reason,
              phase: 'client.bootstrap',
              lastCompletedPhase: 'worker.construct',
            });
            expect(encoded).not.toContain('never-log-this');
          }
          errors.mockClear();
          reply = 'accepted';
          const diagnostics = makeWorkerConnectionDiagnostics({
            sharedWorkerUrl: '/worker.js',
            sessionName: 'account',
            verbose: true,
          });
          const acquired = await acquireWorkerPort({
            sharedWorkerUrl: '/worker.js',
            name: 'accepted',
            signal: new AbortController().signal,
            onError: () => {},
            diagnostics,
          });
          acquired.close();
          expect(errors).not.toHaveBeenCalled();
          expect(info).toHaveBeenCalled();
          expect(diagnostics.clientId).not.toBeNull();
        } finally {
          vi.unstubAllGlobals();
          errors.mockRestore();
          info.mockRestore();
        }
      }),
  );

  it.effect(
    'summarizes worker bootstrap failure privately without changing the original failure or public reply',
    () =>
      Effect.promise(async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const events = new EventTarget();
        vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
        vi.stubGlobal(
          'removeEventListener',
          events.removeEventListener.bind(events),
        );
        vi.stubGlobal('location', {
          href: 'https://worker.example/worker.js?token=secret',
        });
        vi.stubGlobal('navigator', {
          locks: { request: () => new Promise(() => {}) },
        });
        const channel = new MessageChannel();
        const original = {
          code: 'fixture-owner-failed',
          message: 'Owner construction failed',
          credentials: 'never-log-this',
        };
        const connections = makeWorkerConnections(() => {
          // oxlint-disable-next-line no-throw-literal -- Exercise a non-Error bootstrap defect while preserving its identity.
          throw original;
        });
        try {
          const received = Promise.withResolvers<unknown>();
          channel.port2.addEventListener(
            'message',
            event => received.resolve(event.data),
            { once: true },
          );
          channel.port2.start();
          events.dispatchEvent(
            new MessageEvent('connect', { ports: [channel.port1] }),
          );
          const clientId = crypto.randomUUID();
          channel.port2.postMessage({ type: 'zerospin-client', clientId });
          expect(await received.promise).toEqual({
            type: 'zerospin-client-rejected',
            clientId,
          });
          expect(errors).toHaveBeenCalledTimes(1);
          const encoded = errors.mock.calls[0]?.[1];
          if (typeof encoded !== 'string') {
            throw new Error('Expected a diagnostic');
          }
          const record = JSON.parse(encoded);
          expect(record).toMatchObject({
            scope: 'worker',
            clientId,
            reason: 'owner-construction-failed',
          });
          expect(record.error).not.toContain(original.message);
          expect(record.error).not.toContain(original.code);
          expect(encoded).not.toContain('secret');
          expect(encoded).not.toContain('never-log-this');
          expect(
            await connections.close().then(
              () => null,
              error => error,
            ),
          ).toBe(original);
        } finally {
          await connections.close().catch(() => {});
          channel.port1.close();
          channel.port2.close();
          vi.unstubAllGlobals();
          errors.mockRestore();
        }
      }),
  );
});

it('selects fresh storage only across a verified clean of the remembered System', () => {
  const first = { systemId: 'system', id: 'a', replaced: [] };
  const clean = { systemId: 'system', id: 'c', replaced: ['a', 'b'] };
  const legacy = selectDevelopmentStorage(undefined, first, true);
  expect(legacy).toEqual({ systemId: 'system', id: 'a', storageId: null });
  expect(selectDevelopmentStorage(legacy, first, true)).toEqual(legacy);
  const replacement = selectDevelopmentStorage(legacy, clean, true);
  expect(replacement?.storageId).toBe('c');
  expect(selectDevelopmentStorage(replacement, clean, true)).toEqual(
    replacement,
  );
  expect(selectDevelopmentStorage(replacement, undefined, false)).toEqual(
    replacement,
  );
  expect(() => selectDevelopmentStorage(replacement, first, true)).toThrow();
  expect(() =>
    selectDevelopmentStorage(legacy, { ...clean, systemId: 'other' }, true),
  ).toThrow();
  expect(() => selectDevelopmentStorage(legacy, undefined, true)).toThrow();
});
