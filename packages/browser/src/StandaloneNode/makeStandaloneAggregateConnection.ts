import type { IAggregateNodeSink } from '@zerospin/core/AggregateNode/AggregateNode';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { encodeNodeFailure } from '@zerospin/core/Node/encodeNodeFailure';
import {
  ensureZerospinError,
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { newMessagePortRpcSession, RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';
import type * as Scope from 'effect/Scope';

import { acquireWorkerPort } from '../Node/acquireWorkerPort.ts';
import { assertWorkerArtifact } from '../Node/assertWorkerArtifact.ts';
import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { makeWorkerConnectionDiagnostics } from '../Node/makeWorkerConnectionDiagnostics.ts';
import { publicRpcError, restoreRpcError } from '../Node/publicRpcError.ts';
import type {
  IAggregateReplica,
  IAggregateReplicaConnection,
} from '../sessionReplica/replicaConnection.ts';
import { makeStandaloneSharedWorkerName } from '../sharedWorkerNames.ts';
import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import type { IStandaloneBrowserSessionApi } from './StandaloneBrowserSessionApi.ts';
import type { IStandaloneSharedWorkerApi } from './StandaloneSharedWorkerApi.ts';

/** Construct a cold local connection; scoped startup owns all transport resources. */
export function makeStandaloneAggregateConnection(props: {
  key: string;
  attachment: unknown;
  signal: AbortSignal;
  sharedWorkerUrl: string;
  onProtocolFailure(error: unknown): void;
}): IAggregateReplicaConnection & {
  start(
    replica: IAggregateReplica,
  ): Effect.Effect<void, IAnyError, Scope.Scope>;
  getPushPaused: Effect.Effect<boolean, IAnyError>;
  setPushPaused(input: { pushPaused: boolean }): Effect.Effect<void, IAnyError>;
  pushNow: Effect.Effect<{ status: 'empty' | 'pushed' }, IAnyError>;
} {
  const { key, attachment, signal, sharedWorkerUrl, onProtocolFailure } = props;
  let replica: IAggregateReplica;
  let disposed = false;
  let verified = false;
  let broken = false;
  let opening: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  let api: RpcStub<IStandaloneSharedWorkerApi> | null = null;
  let node: RpcStub<IStandaloneBrowserSessionApi> | null = null;
  let callback: RpcStub<Required<IAggregateNodeSink>> | null = null;
  let recoveryCallback: RpcStub<
    (error: IZerospinErrorJson) => Promise<void>
  > | null = null;
  let nodeId: string | undefined;
  let startupTimeout: ReturnType<typeof setTimeout> | null = null;
  let lifetime: AbortController | null = null;
  let releasePort = () => {};
  const openingController = new AbortController();
  const startup = makeWorkerConnectionDiagnostics({
    sharedWorkerUrl,
    sessionName: 'standalone',
  });
  const ready = Promise.withResolvers<void>();
  void ready.promise.catch(() => undefined);
  const closeConnection = () => {
    let first: unknown;
    const attempt = (release: () => void) => {
      try {
        release();
      } catch (error) {
        first ??= error;
      }
    };
    if (startupTimeout !== null) clearTimeout(startupTimeout);
    startupTimeout = null;
    attempt(() => lifetime?.abort());
    lifetime = null;
    attempt(() => callback?.[Symbol.dispose]());
    callback = null;
    attempt(() => recoveryCallback?.[Symbol.dispose]());
    recoveryCallback = null;
    attempt(() => node?.[Symbol.dispose]());
    node = null;
    attempt(() => api?.[Symbol.dispose]());
    api = null;
    attempt(releasePort);
    releasePort = () => {};
    if (first !== undefined) {
      throw ensureZerospinError({
        code: 'node-connection-release-failed',
        error: first,
      });
    }
  };
  const lost = (event?: unknown) => {
    if (disposed || broken) return;
    startup.fail({ reason: 'rpc-disconnected', event });
    broken = true;
    verified = false;
    const error =
      typeof ErrorEvent !== 'undefined' &&
      event instanceof ErrorEvent &&
      event.error != null
        ? event.error
        : event instanceof Error
          ? event
          : makeZerospinError('standalone-worker-unavailable');
    ready.reject(error);
    openingController.abort();
    replica.connectionFailed({ error });
    try {
      closeConnection();
    } catch {
      // The originating error owns this failed connection.
    }
    replica.state({
      localAvailability: 'unavailable',
      authentication: 'unavailable',
      synchronization: 'offline',
      blockedWork: false,
      failure: encodeNodeFailure('standalone-worker-unavailable', error),
      admissionRejection: null,
    });
  };
  const attachReplica = async (
    currentApi: RpcStub<IStandaloneSharedWorkerApi>,
    request: unknown,
    pendingCommands: () => readonly IAggregateNodeCommand[],
    recoveryNotice: RpcStub<(error: IZerospinErrorJson) => Promise<void>>,
  ): Promise<void> => {
    if (disposed || broken || api !== currentApi) return;
    startup.step('node.attachment');
    const attached = await awaitConnectionStep(
      currentApi.attach(request, recoveryNotice).catch(restoreRpcError),
      openingController.signal,
    );
    startup.complete('node.attachment');
    startup.step('replica.delivery');
    if (disposed || broken || api !== currentApi) {
      attached[Symbol.dispose]();
      return;
    }
    const previous = node;
    const previousCallback = callback;
    const retired = Promise.withResolvers<void>();
    let active = true;
    const isCurrent = () =>
      !disposed && !broken && active && node === attached && api === currentApi;
    const resetAttachment = async (options?: { preservePending?: boolean }) => {
      if (!isCurrent()) {
        if (
          !disposed &&
          !broken &&
          !active &&
          node === attached &&
          api === currentApi &&
          options?.preservePending !== true
        ) {
          await replica.reset(options);
        }
        return;
      }
      active = false;
      retired.resolve();
      verified = false;
      try {
        await replica.reset(options);
      } catch (error) {
        if (disposed || broken || node !== attached || api !== currentApi) {
          return;
        }
        startup.fail({ reason: 'exception', error });
        onProtocolFailure(error);
        lost(error);
        throw error;
      }
      if (disposed || broken || node !== attached || api !== currentApi) return;
      if (startupTimeout !== null) clearTimeout(startupTimeout);
      startupTimeout = setTimeout(() => {
        if (disposed || broken || openingController.signal.aborted) return;
        startup.fail({ reason: 'startup-timeout', timeoutMs: 15000 });
        lost();
      }, 15000);
      // Acknowledge before reacquiring: the runtime's reset still owns its attachment serial.
      queueMicrotask(() => {
        void attachReplica(
          currentApi,
          Object.assign({}, attachment, { reset: false }),
          () => replica.pendingCommands(),
          recoveryNotice,
        ).catch(error => {
          if (disposed || broken) return;
          startup.fail({ reason: 'exception', error });
          onProtocolFailure(error);
          lost(error);
        });
      });
    };
    const receive = new RpcStub<Required<IAggregateNodeSink>>({
      reset: resetAttachment,
      view: async snapshot => {
        if (!isCurrent()) return;
        if (nodeId !== undefined && nodeId !== snapshot.metadata.nodeId) {
          const error = makeZerospinError('node-epoch-changed');
          startup.fail({ reason: 'exception', error });
          onProtocolFailure(error);
          ready.reject(error);
          throw error;
        }
        nodeId = snapshot.metadata.nodeId;
        await replica.view(snapshot).catch(error => {
          if (isCurrent()) {
            startup.fail({ reason: 'exception', error });
            onProtocolFailure(error);
            ready.reject(error);
          }
          throw error;
        });
      },
      state: async received => {
        if (isCurrent() && received.nodeId === nodeId) {
          replica.state(received);
        }
      },
    });
    node = attached;
    callback = receive;
    nodeId = undefined;
    try {
      previousCallback?.[Symbol.dispose]();
    } finally {
      previous?.[Symbol.dispose]();
    }
    try {
      await awaitConnectionStep(
        Promise.race([
          attached
            .subscribe({ pendingCommands: pendingCommands() }, receive)
            .catch(restoreRpcError),
          retired.promise,
        ]),
        openingController.signal,
      );
      if (!isCurrent()) return;
      verified = true;
      await replica.attachmentReady();
      if (!isCurrent()) return;
      if (startupTimeout !== null) clearTimeout(startupTimeout);
      startupTimeout = null;
      startup.complete('replica.delivery');
      startup.step('connection.active');
      ready.resolve();
    } catch (error) {
      if (!isCurrent()) return;
      if (
        isZerospinError(error) &&
        error.code === 'standalone-capability-stale'
      ) {
        await resetAttachment();
        return;
      }
      throw error;
    }
  };
  const connection = {
    journalIdentityKey: () => key,
    stagedCommandAttachment: (
      expectedNodeId: string,
    ): ReturnType<IAggregateReplicaConnection['stagedCommandAttachment']> => {
      if (
        disposed ||
        !verified ||
        broken ||
        node === null ||
        expectedNodeId !== nodeId
      ) {
        return null;
      }
      const attached = node;
      return {
        subscriber: () => attached.getStagedCommandSubscriber(expectedNodeId),
        isCurrent: () =>
          !disposed &&
          verified &&
          !broken &&
          attached === node &&
          expectedNodeId === nodeId,
      };
    },
    start: (receiving: IAggregateReplica) =>
      Effect.gen(function* () {
        if (opening !== null) {
          const pending = opening;
          yield* Effect.tryPromise({
            try: () => pending,
            catch: cause => {
              if (isZerospinError(cause)) return cause;
              throw cause;
            },
          });
          return;
        }
        if (disposed || signal.aborted) {
          return yield* makeZerospinError('node-tab-detached');
        }
        replica = receiving;
        yield* Effect.addFinalizer(() => Effect.promise(dispose));
        signal.addEventListener('abort', abort, { once: true });
        opening = (async () => {
          startupTimeout = setTimeout(() => {
            if (disposed || broken || openingController.signal.aborted) return;
            startup.fail({ reason: 'startup-timeout', timeoutMs: 15000 });
            lost();
          }, 15000);
          const acquired = await acquireWorkerPort({
            sharedWorkerUrl,
            name: makeStandaloneSharedWorkerName(key),
            signal: openingController.signal,
            onError: lost,
            diagnostics: startup,
          });
          releasePort = acquired.close;
          if (disposed || broken) {
            acquired.close();
            throw makeZerospinError('node-tab-detached');
          }
          const { port, artifactUrl } = acquired;
          api = newMessagePortRpcSession<IStandaloneSharedWorkerApi>(
            port,
            undefined,
            { onSendError: publicRpcError },
          );
          const currentApi = api;
          api.onRpcBroken(lost);
          startup.step('rpc.ready');
          const started = await awaitConnectionStep(
            currentApi.ready().catch(restoreRpcError),
            openingController.signal,
          );
          startup.complete('rpc.ready');
          startup.step('worker.validate');
          assertWorkerArtifact(artifactUrl, started);
          if (started.version !== sharedWorkerVersion) {
            throw makeZerospinError('node-worker-version-mismatch');
          }
          startup.complete('worker.validate');
          lifetime = new AbortController();
          void navigator.locks
            .request(
              `/zerospin/standalone/${key}:lifetime`,
              { mode: 'shared', signal: lifetime.signal },
              lost,
            )
            .catch(() => undefined);
          recoveryCallback = new RpcStub(async (error: IZerospinErrorJson) => {
            if (!disposed && !broken && api === currentApi) {
              replica.recoveryWarning({ error: makeZerospinError(error) });
            }
          });
          await attachReplica(
            currentApi,
            attachment,
            () => replica.pendingCommands(),
            recoveryCallback,
          );
          await awaitConnectionStep(ready.promise, openingController.signal);
          if (disposed || broken) throw makeZerospinError('node-tab-detached');
        })();
        void opening.catch(error => {
          if (
            !disposed &&
            !signal.aborted &&
            !openingController.signal.aborted
          ) {
            startup.fail({ reason: 'exception', error });
          }
          try {
            closeConnection();
          } catch {
            // The originating error owns this failed connection.
          }
          if (!disposed) onProtocolFailure(error);
        });
        const pending = opening;
        yield* Effect.tryPromise({
          try: () => pending,
          catch: cause => {
            if (isZerospinError(cause)) return cause;
            throw cause;
          },
        });
      }),
    getPushPaused: Effect.tryPromise({
      try: async () => requireNode().getPushPaused().catch(restoreRpcError),
      catch: cause => {
        if (isZerospinError(cause)) return cause;
        throw cause;
      },
    }),
    setPushPaused: (input: { pushPaused: boolean }) =>
      Effect.tryPromise({
        try: async () =>
          requireNode().setPushPaused(input).catch(restoreRpcError),
        catch: cause => {
          if (isZerospinError(cause)) return cause;
          throw cause;
        },
      }),
    pushNow: Effect.tryPromise({
      try: async () => requireNode().pushNow().catch(restoreRpcError),
      catch: cause => {
        if (isZerospinError(cause)) return cause;
        throw cause;
      },
    }),
  };
  function requireNode() {
    if (disposed || broken || !verified || node === null) {
      throw makeZerospinError('node-tab-detached');
    }
    return node;
  }
  const dispose = () => {
    if (disposal !== null) return disposal;
    const completion = Promise.withResolvers<void>();
    disposal = completion.promise;
    disposed = true;
    verified = false;
    openingController.abort();
    ready.reject(makeZerospinError('node-tab-detached'));
    signal.removeEventListener('abort', abort);
    void (async () => {
      let first: unknown;
      try {
        closeConnection();
      } catch (error) {
        first = error;
      }
      await opening?.catch(() => undefined);
      if (first !== undefined) {
        throw ensureZerospinError({
          code: 'node-connection-release-failed',
          error: first,
        });
      }
    })().then(completion.resolve, completion.reject);
    return disposal;
  };
  const abort = () => {
    void dispose().catch(() => undefined);
  };
  return connection;
}
