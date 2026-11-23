import { describe, expect, it } from '@effect/vitest';
import { makeAggregateSharedWorkerRoutingKey } from '@zerospin/browser/AggregateNode/aggregateNodeRequest';
import { makeAggregateNodeDefinition } from '@zerospin/browser/AggregateNode/makeAggregateNodeDefinition';
import type { makeAggregateWorkerRuntime } from '@zerospin/browser/AggregateNode/makeAggregateWorkerRuntime';
import type { resolveAggregateNode } from '@zerospin/browser/AggregateNode/resolveAggregateNode';
import { subscribe as subscribeAggregate } from '@zerospin/browser/AggregateNode/subscribe/subscribe';
import type { IAggregateNodeResolution } from '@zerospin/browser/AggregateNode/verifiedAggregateAdmission';
import { closeNodeStorageOwner } from '@zerospin/browser/Node/closeNodeStorageOwner';
import { makeBrowserSessionSubscription } from '@zerospin/browser/Node/makeBrowserSessionSubscription';
import { makeNodeCommandInterests } from '@zerospin/browser/Node/makeNodeCommandInterests';
import type { makeWorkerConnections } from '@zerospin/browser/Node/makeWorkerConnections';
import { subscribe as subscribeService } from '@zerospin/browser/ServiceNode/subscribe/subscribe';
import type {
  AggregateNode,
  IAggregateNodeSnapshot,
  IAggregateNodeState,
} from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import { makeNodeCommandId } from '@zerospin/core/contracts/commandIds';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import type {
  IServiceNodeSnapshot,
  IServiceNodeState,
  ServiceNode,
} from '@zerospin/core/ServiceNode/ServiceNode';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { makeAggregateSessionDefinition } from '@zerospin/core/sessionDefinition/makeAggregateSessionDefinition';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { RpcStub, RpcTarget } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { vi } from 'vitest';

/** Own RPC capability disposal and deterministic callback barriers. */
function makeSink<VIEW, STATE>() {
  const delivered: VIEW[] = [];
  const states: STATE[] = [];
  const releases = new Set<ReturnType<typeof Promise.withResolvers<void>>>();
  let held:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  let resets = 0;
  const sink = new RpcStub(
    new (class extends RpcTarget {
      async view(snapshot: VIEW) {
        const barrier = held;
        held = undefined;
        if (barrier !== undefined) {
          barrier.entered.resolve();
          await barrier.release.promise;
        }
        delivered.push(snapshot);
      }

      async state(state: STATE) {
        states.push(state);
      }

      async reset() {
        resets += 1;
      }
    })(),
  );
  return {
    sink,
    delivered,
    states,
    resetCount: () => resets,
    holdNext() {
      const barrier = {
        entered: Promise.withResolvers<void>(),
        release: Promise.withResolvers<void>(),
      };
      releases.add(barrier.release);
      held = barrier;
      return barrier;
    },
    close() {
      for (const release of releases) {
        release.resolve();
      }
      sink[Symbol.dispose]();
    },
  };
}

const state = {
  localAvailability: 'available' as const,
  authentication: 'remembered',
  synchronization: 'offline',
  blockedWork: false,
  admissionRejection: null,
  failure: null,
};

// These are wrapper-boundary tests: the real subscription and interest owners
// receive controlled Node deliveries; SQL, browser transport and host behavior are outside this proof.
describe('Browser subscription delivery fences', () => {
  it.effect(
    'Aggregate keeps replacement and reset interests after an old final callback completes',
    () =>
      Effect.gen(function* () {
        const interests = makeNodeCommandInterests<IAggregateNodeCommand>();
        const subscription = makeBrowserSessionSubscription();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => subscription.dispose()),
        );
        const command: IAggregateNodeCommand = {
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          sessionId: 'sesn_owned',
          sessionIndex: 1,
          kind: 'actor',
          commandName: 'record',
          contractVersion: 1,
          aggregateName: 'account',
          aggregateVersion: 1,
          aggregateId: 'account',
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'member',
          claims: { aggregateId: 'account' },
          payload: '{}',
          stagingOutcome: {
            result: 1,
            completedAt: '2026-10-26T00:00:00.000Z',
          },
        };
        const request = {
          pendingCommands: [command],
        };
        const snapshot: IAggregateNodeSnapshot = {
          identity: {
            apiUrl: 'https://subscription.example',
            publishableKey: 'pub_subscription',
            systemName: 'subscription',
            aggregateName: 'account',
            aggregateVersion: 1,
            aggregateId: 'account',
            actorName: 'member',
            actorVersion: 1,
            sessionName: 'member',
            claims: { aggregateId: 'account' },
            definitionHash: 'subscription',
          },
          state,
          metadata: {
            nodeId: 'node_owned',
            aggregateId: 'account',
            sessionKey: 'subscription',
            aggregateIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            admittedThroughPushIndex: 1,
            pushPaused: false,
          },
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 1,
          resources: [],
          commandCoverage: [
            {
              sessionId: command.sessionId,
              sessionIndex: command.sessionIndex,
              commandName: command.commandName,
              nodeId: 'node_owned',
              nodeIndex: 1,
              pushIndex: 1,
              resolution: {
                id: makeNodeCommandId('node_owned', 1),
                commandName: command.commandName,
                aggregateIndex: 1,
                failure: null,
              },
            },
          ],
        };
        const callbacks: Parameters<AggregateNode['subscribe']>[1][] = [];
        const signOutNotifications: ((
          state: IAggregateNodeState,
        ) => Promise<void>)[] = [];
        let current = true;
        const unsubscribed: number[] = [];
        const node: Pick<AggregateNode, 'subscribe'> = {
          subscribe: async (_input, sink) => {
            const index = callbacks.length;
            callbacks.push(sink);
            return () => {
              unsubscribed.push(index);
            };
          },
        };
        const old = makeSink<IAggregateNodeSnapshot, IAggregateNodeState>();
        const replacement = makeSink<
          IAggregateNodeSnapshot,
          IAggregateNodeState
        >();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            old.close();
            replacement.close();
          }),
        );
        const subscribe = (sink: typeof old.sink) =>
          subscribeAggregate({
            request,
            interests,
            sink,
            node,
            subscription,
            check: () => {},
            isCurrent: () => current,
            isDetached: () => false,
            onReset: () => {},
            registerSignOutNotification: notify =>
              signOutNotifications.push(notify),
          });
        yield* subscribe(old.sink);
        const oldBarrier = old.holdNext();
        const oldDelivery = callbacks[0]!.view(snapshot);
        yield* Effect.promise(() => oldBarrier.entered.promise);
        yield* subscribe(replacement.sink);
        expect(unsubscribed).toEqual([0]);
        oldBarrier.release.resolve();
        yield* Effect.promise(() => oldDelivery);
        expect(interests.read()).toEqual(request.pendingCommands);

        const resetBarrier = replacement.holdNext();
        const resetDelivery = callbacks[1]!.view(snapshot);
        yield* Effect.promise(() => resetBarrier.entered.promise);
        yield* Effect.promise(() => callbacks[1]!.reset!());
        expect(replacement.resetCount()).toBe(1);
        expect(interests.read()).toEqual([]);
        interests.add(request.pendingCommands);
        resetBarrier.release.resolve();
        yield* Effect.promise(() => resetDelivery);
        expect(interests.read()).toEqual(request.pendingCommands);
        yield* Effect.promise(() => callbacks[1]!.view(snapshot));
        expect(interests.read()).toEqual([]);
        expect(replacement.delivered).toEqual([snapshot, snapshot]);

        current = false;
        const signedOut = {
          ...state,
          authentication: 'signed-out',
          blockedWork: true,
          nodeId: snapshot.metadata.nodeId,
          nodeIndex: snapshot.nodeIndex,
          pushIndex: snapshot.pushIndex,
          admittedThroughPushIndex: snapshot.metadata.admittedThroughPushIndex,
          outcomeIndex: snapshot.outcomeIndex,
          pushPaused: snapshot.metadata.pushPaused,
        };
        yield* Effect.promise(() => signOutNotifications[0]!(signedOut));
        yield* Effect.promise(() => signOutNotifications[1]!(signedOut));
        expect(old.states).toEqual([]);
        expect(replacement.states).toEqual([signedOut]);

        subscription.dispose();
        yield* Effect.promise(() => signOutNotifications[1]!(signedOut));
        expect(replacement.states).toEqual([signedOut]);
        interests.add(request.pendingCommands);
        yield* Effect.promise(() => callbacks[1]!.view(snapshot));
        expect(replacement.delivered).toHaveLength(2);
        expect(interests.read()).toEqual(request.pendingCommands);
        expect(unsubscribed).toEqual([0, 1]);
      }),
  );

  it.effect(
    'Service keeps replacement and reset interests after an old final callback completes',
    () =>
      Effect.gen(function* () {
        const interests = makeNodeCommandInterests<IServiceNodeCommand>();
        const subscription = makeBrowserSessionSubscription();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => subscription.dispose()),
        );
        const command: IServiceNodeCommand = {
          id: null,
          nodeId: null,
          nodeIndex: null,
          pushIndex: null,
          sessionId: 'sesn_owned',
          sessionIndex: 1,
          kind: 'actor',
          commandName: 'record',
          contractVersion: 1,
          serviceName: 'account',
          actorName: 'member',
          actorVersion: 1,
          sessionName: 'member',
          claims: {},
          payload: '{}',
          stagingOutcome: {
            result: 1,
            completedAt: '2026-10-26T00:00:00.000Z',
          },
        };
        const request = {
          pendingCommands: [command],
        };
        const snapshot: IServiceNodeSnapshot = {
          identity: {
            apiUrl: 'https://subscription.example',
            publishableKey: 'pub_subscription',
            systemName: 'subscription',
            serviceName: 'account',
            serviceVersion: 1,
            actorName: 'member',
            actorVersion: 1,
            sessionName: 'member',
            claims: {},
            definitionHash: 'subscription',
          },
          state,
          metadata: {
            nodeId: 'node_owned',
            sessionKey: 'subscription',
            serviceIndex: 1,
            dispositionChainHash: '1'.repeat(64),
            admittedThroughPushIndex: 1,
            pushPaused: false,
          },
          nodeIndex: 2,
          pushIndex: 1,
          outcomeIndex: 1,
          resources: [],
          commandCoverage: [
            {
              sessionId: command.sessionId,
              sessionIndex: command.sessionIndex,
              commandName: command.commandName,
              nodeId: 'node_owned',
              nodeIndex: 1,
              pushIndex: 1,
              resolution: {
                id: makeNodeCommandId('node_owned', 1),
                commandName: command.commandName,
                serviceIndex: 1,
                failure: null,
              },
            },
          ],
        };
        const callbacks: Parameters<ServiceNode['subscribe']>[1][] = [];
        const signOutNotifications: ((
          state: IServiceNodeState,
        ) => Promise<void>)[] = [];
        let current = true;
        const unsubscribed: number[] = [];
        const node: Pick<ServiceNode, 'subscribe'> = {
          subscribe: async (_input, sink) => {
            const index = callbacks.length;
            callbacks.push(sink);
            return () => {
              unsubscribed.push(index);
            };
          },
        };
        const old = makeSink<IServiceNodeSnapshot, IServiceNodeState>();
        const replacement = makeSink<IServiceNodeSnapshot, IServiceNodeState>();
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            old.close();
            replacement.close();
          }),
        );
        const subscribe = (sink: typeof old.sink) =>
          subscribeService({
            request,
            interests,
            sink,
            node,
            subscription,
            check: () => {},
            isCurrent: () => current,
            isDetached: () => false,
            onReset: () => {},
            registerSignOutNotification: notify =>
              signOutNotifications.push(notify),
          });
        yield* subscribe(old.sink);
        const oldBarrier = old.holdNext();
        const oldDelivery = callbacks[0]!.view(snapshot);
        yield* Effect.promise(() => oldBarrier.entered.promise);
        yield* subscribe(replacement.sink);
        expect(unsubscribed).toEqual([0]);
        oldBarrier.release.resolve();
        yield* Effect.promise(() => oldDelivery);
        expect(interests.read()).toEqual(request.pendingCommands);

        const resetBarrier = replacement.holdNext();
        const resetDelivery = callbacks[1]!.view(snapshot);
        yield* Effect.promise(() => resetBarrier.entered.promise);
        yield* Effect.promise(() => callbacks[1]!.reset!());
        expect(replacement.resetCount()).toBe(1);
        expect(interests.read()).toEqual([]);
        interests.add(request.pendingCommands);
        resetBarrier.release.resolve();
        yield* Effect.promise(() => resetDelivery);
        expect(interests.read()).toEqual(request.pendingCommands);
        yield* Effect.promise(() => callbacks[1]!.view(snapshot));
        expect(interests.read()).toEqual([]);
        expect(replacement.delivered).toEqual([snapshot, snapshot]);

        current = false;
        const signedOut = {
          ...state,
          authentication: 'signed-out',
          blockedWork: true,
          nodeId: snapshot.metadata.nodeId,
          nodeIndex: snapshot.nodeIndex,
          pushIndex: snapshot.pushIndex,
          admittedThroughPushIndex: snapshot.metadata.admittedThroughPushIndex,
          outcomeIndex: snapshot.outcomeIndex,
          pushPaused: snapshot.metadata.pushPaused,
        };
        yield* Effect.promise(() => signOutNotifications[0]!(signedOut));
        yield* Effect.promise(() => signOutNotifications[1]!(signedOut));
        expect(old.states).toEqual([]);
        expect(replacement.states).toEqual([signedOut]);

        subscription.dispose();
        yield* Effect.promise(() => signOutNotifications[1]!(signedOut));
        expect(replacement.states).toEqual([signedOut]);
        interests.add(request.pendingCommands);
        yield* Effect.promise(() => callbacks[1]!.view(snapshot));
        expect(replacement.delivered).toHaveLength(2);
        expect(interests.read()).toEqual(request.pendingCommands);
        expect(unsubscribed).toEqual([0, 1]);
      }),
  );
});

// These shared cleanup checks do not exercise browser storage or native host APIs.
describe('Node storage owner cleanup', () => {
  it.effect(
    'retains a failed identity lease without blocking another identity',
    () =>
      Effect.promise(async () => {
        const rejected = makeZerospinError('node-storage-incomplete');
        const cleanupFailure = makeZerospinError('node-storage-close-failed');
        const entered = Promise.withResolvers<void>();
        const firstClosing = Promise.withResolvers<void>();
        const runtimeKeys: string[] = [];
        const namespaces: { close(): Promise<void> }[] = [];
        let createGroup:
          | Parameters<typeof makeWorkerConnections>[0]
          | undefined;
        vi.doMock('@zerospin/browser/Node/makeWorkerConnections', () => ({
          makeWorkerConnections: (
            factory: Parameters<typeof makeWorkerConnections>[0],
          ) => {
            createGroup = factory;
            return { close: async () => {} };
          },
        }));
        vi.doMock('@zerospin/browser/Node/makeNodeNamespaceLease', () => ({
          makeNodeNamespaceLease: () => {
            const namespace = {
              ready: Promise.resolve(),
              preventOpening: vi.fn(),
              close: vi.fn(async () => {}),
            };
            namespaces.push(namespace);
            return namespace;
          },
        }));
        vi.doMock(
          '@zerospin/browser/AggregateNode/aggregateSessionDiscovery',
          () => ({
            aggregateSessionDiscovery: {
              revision: async () => 0,
              check: async () => {},
            },
          }),
        );
        vi.doMock(
          '@zerospin/browser/AggregateNode/resolveAggregateNode',
          () => ({
            resolveAggregateNode: async (
              input: Parameters<typeof resolveAggregateNode>[0],
            ): Promise<IAggregateNodeResolution> => {
              if (input.expectedClaims === undefined) {
                throw new Error('Claims required by this scenario');
              }
              return {
                request: input.request,
                definition: await makeAggregateNodeDefinition(
                  input.request,
                  input.expectedClaims,
                  input.aggregateId,
                ),
                revision: input.revision,
                online: false,
              };
            },
          }),
        );
        vi.doMock(
          '@zerospin/browser/AggregateNode/makeAggregateWorkerRuntime',
          () => ({
            makeAggregateWorkerRuntime: (
              input: Parameters<typeof makeAggregateWorkerRuntime>[0],
            ) => {
              const index = runtimeKeys.push(input.sessionKey) - 1;
              return {
                attach: (
                  ...args: Parameters<
                    ReturnType<typeof makeAggregateWorkerRuntime>['attach']
                  >
                ) => {
                  if (index === 0) return Effect.fail(rejected);
                  const signal = args[3];
                  if (signal === undefined) {
                    throw new Error('Attachment cancellation required');
                  }
                  return Effect.callback<never, IAnyError>(resume => {
                    const abort = () =>
                      resume(
                        Effect.fail(makeZerospinError('node-tab-detached')),
                      );
                    signal.addEventListener('abort', abort, { once: true });
                    entered.resolve();
                    if (signal.aborted) abort();
                    return Effect.sync(() =>
                      signal.removeEventListener('abort', abort),
                    );
                  });
                },
                close: async () => {
                  if (index === 0) {
                    firstClosing.resolve();
                    throw cleanupFailure;
                  }
                },
              };
            },
          }),
        );
        let disposeApi = () => {};
        let closeGroup = async () => {};
        const provider = new RpcStub<
          () => Promise<IAggregateAuthenticationRequest>
        >(async () => ({
          aggregateId: 'account',
          credentials: { token: 'test' },
        }));
        try {
          const [{ makeAggregateSharedWorker }, { AggregateSharedWorkerApi }] =
            await Promise.all([
              import('@zerospin/browser/AggregateNode/makeAggregateSharedWorker'),
              import('@zerospin/browser/AggregateNode/AggregateSharedWorkerApi'),
            ]);
          const definition = makeAggregateSessionDefinition({
            systemName: 'cleanup',
            aggregateName: 'account',
            aggregateVersion: 1,
            actorName: 'member',
            actorVersion: 1,
            sessionName: 'member',
            claimsSchema: Schema.Struct({
              aggregateId: Schema.String,
              memberId: Schema.String,
            }),
            models: {},
            contracts: {},
          });
          const request = {
            apiUrl: 'https://cleanup.invalid',
            publishableKey: 'pub_cleanup',
            systemName: definition.systemName,
            aggregateName: definition.aggregateName,
            aggregateVersion: definition.aggregateVersion,
            sessionName: definition.sessionName,
            lock: makeAggregateSessionLock(definition),
          };
          makeAggregateSharedWorker({
            execution: { sessionDefinition: definition },
            sqliteWasmUrl: '/unused.wasm',
            name: 'unused',
            routingKey: await makeAggregateSharedWorkerRoutingKey(
              request,
              'account',
            ),
          });
          if (createGroup === undefined) {
            throw new Error('Host connection group was not registered');
          }
          const group = createGroup();
          const api = group.createApi();
          if (!(api instanceof AggregateSharedWorkerApi)) {
            throw new Error('Aggregate host API required');
          }
          disposeApi = () => api[Symbol.dispose]();
          closeGroup = () => group.close({ close: disposeApi });
          const attachment = {
            request,
            aggregateId: 'account',
            expectedClaims: { aggregateId: 'account', memberId: 'first' },
          };
          await expect(api.attach(attachment, provider)).rejects.toBe(rejected);
          await firstClosing.promise;
          await expect(api.attach(attachment, provider)).rejects.toBe(
            cleanupFailure,
          );
          expect(runtimeKeys).toHaveLength(1);
          expect(namespaces[0]!.close).not.toHaveBeenCalled();

          const unrelated = api.attach(
            {
              ...attachment,
              expectedClaims: { aggregateId: 'account', memberId: 'second' },
            },
            provider,
          );
          void unrelated.catch(() => undefined);
          await entered.promise;
          expect(runtimeKeys).toHaveLength(2);
          expect(runtimeKeys[1]).not.toBe(runtimeKeys[0]);
          disposeApi();
          await expect(unrelated).rejects.toMatchObject({
            code: 'node-tab-detached',
          });
          await closeGroup();
          expect(namespaces[0]!.close).not.toHaveBeenCalled();
          expect(namespaces[1]!.close).toHaveBeenCalledOnce();
        } finally {
          disposeApi();
          await closeGroup();
          provider[Symbol.dispose]();
          for (const modulePath of [
            '@zerospin/browser/Node/makeWorkerConnections',
            '@zerospin/browser/Node/makeNodeNamespaceLease',
            '@zerospin/browser/AggregateNode/aggregateSessionDiscovery',
            '@zerospin/browser/AggregateNode/resolveAggregateNode',
            '@zerospin/browser/AggregateNode/makeAggregateWorkerRuntime',
          ]) {
            vi.doUnmock(modulePath);
          }
          vi.resetModules();
        }
      }),
  );

  it.effect(
    'holds namespace exclusion until owned storage finishes draining',
    () =>
      Effect.promise(async () => {
        const entered = Promise.withResolvers<void>();
        const drained = Promise.withResolvers<void>();
        const released: string[] = [];
        const closing = closeNodeStorageOwner({
          connections: {
            close: () => {
              released.push('connections');
            },
          },
          synchronization: {
            stop: () => {
              released.push('synchronization');
            },
          },
          node: {
            close: () => {
              released.push('node');
            },
          },
          runtime: {
            dispose: async () => {
              released.push('runtime');
            },
          },
          storage: {
            close: async () => {
              released.push('storage');
              entered.resolve();
              await drained.promise;
            },
          },
          namespace: {
            close: async () => {
              released.push('namespace');
            },
          },
        });
        try {
          await entered.promise;
          expect(released).toEqual([
            'connections',
            'synchronization',
            'node',
            'runtime',
            'storage',
          ]);
        } finally {
          drained.resolve();
          await closing;
        }
        expect(released).toEqual([
          'connections',
          'synchronization',
          'node',
          'runtime',
          'storage',
          'namespace',
        ]);
      }),
  );

  it.effect(
    'finishes independent cleanup and retains exclusion after failure',
    () =>
      Effect.promise(async () => {
        const firstFailure = new Error('Connections could not close');
        const laterFailure = new Error('Storage could not close');
        const entered = Promise.withResolvers<void>();
        const drained = Promise.withResolvers<void>();
        const released: string[] = [];
        const failure = closeNodeStorageOwner({
          connections: {
            close: () => {
              released.push('connections');
              throw firstFailure;
            },
          },
          synchronization: {
            stop: () => {
              released.push('synchronization');
            },
          },
          node: {
            close: () => {
              released.push('node');
            },
          },
          runtime: {
            dispose: async () => {
              released.push('runtime');
            },
          },
          storage: {
            close: async () => {
              released.push('storage');
              entered.resolve();
              await drained.promise;
              throw laterFailure;
            },
          },
          namespace: {
            close: async () => {
              released.push('namespace');
            },
          },
        }).then(
          () => null,
          error => error,
        );
        try {
          await entered.promise;
          expect(released).toEqual([
            'connections',
            'synchronization',
            'node',
            'runtime',
            'storage',
          ]);
        } finally {
          drained.resolve();
          await failure;
        }
        expect(await failure).toBe(firstFailure);
        expect(released).toEqual([
          'connections',
          'synchronization',
          'node',
          'runtime',
          'storage',
        ]);
      }),
  );
});
