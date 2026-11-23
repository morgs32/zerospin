import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { encodeNodeFailure } from '@zerospin/core/Node/encodeNodeFailure';
import { sessionKey } from '@zerospin/core/Node/sessionKey';
import type {
  IServiceNodeSnapshot,
  ServiceNode,
} from '@zerospin/core/ServiceNode/ServiceNode';
import {
  ensureZerospinError,
  isZerospinError,
  makeZerospinError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { newMessagePortRpcSession, RpcStub } from 'capnweb';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import type * as Scope from 'effect/Scope';
import { isEqual } from 'es-toolkit';

import { acquireWorkerPort } from '../Node/acquireWorkerPort.ts';
import { admissionValue } from '../Node/admissionValue.ts';
import { assertWorkerArtifact } from '../Node/assertWorkerArtifact.ts';
import { AuthenticationRejectedHttpStatusSchema } from '../Node/AuthenticationRejectedHttpStatusSchema.ts';
import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { isBrowserOffline } from '../Node/isBrowserOffline.ts';
import { makeWorkerConnectionDiagnostics } from '../Node/makeWorkerConnectionDiagnostics.ts';
import { makeServiceNodeNamespace } from '../Node/nodeStorageNamespaces.ts';
import { publicRpcError, restoreRpcError } from '../Node/publicRpcError.ts';
import type {
  IServiceReplica,
  IServiceReplicaConnection,
} from '../sessionReplica/replicaConnection.ts';
import { makeServiceSharedWorkerName } from '../sharedWorkerNames.ts';
import { sharedWorkerVersion } from '../sharedWorkerVersion.ts';

import { makeServiceNodeDefinition } from './makeServiceNodeDefinition.ts';
import {
  makeServiceNodeUpgradeJournal,
  type IServiceNodeUpgradeJournal,
} from './recoverServiceTabJournal.ts';
import type { IServiceBrowserSessionApi } from './ServiceBrowserSessionApi.ts';
import {
  makeServiceSharedWorkerRoutingKey,
  type IServiceNodeRequest,
} from './serviceNodeRequest.ts';
import type { ServiceSharedWorkerApi } from './ServiceSharedWorkerApi.ts';

export function makeConnectedServiceConnection(props: {
  signal: AbortSignal;
  retryConnection?: true | undefined;
  diagnostics?:
    | {
        recordPhase(
          phase: string,
          durationMs: number,
          outcome: 'ready' | 'failed' | 'cancelled',
          errorCode: string | null,
        ): void;
      }
    | undefined;
  onProtocolFailure(error: unknown): void;
  sharedWorkerUrl: string;
  request: IServiceNodeRequest;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
}): IServiceReplicaConnection & {
  start(replica: IServiceReplica): Effect.Effect<void, IAnyError, Scope.Scope>;
  clearAuthentication: Effect.Effect<void, IAnyError>;
} {
  const {
    signal,
    retryConnection,
    diagnostics,
    onProtocolFailure,
    sharedWorkerUrl,
    request,
    getAdmission,
    expectedClaims,
  } = props;
  let replica: IServiceReplica;
  let disposed = false;
  let signedOut = false;
  let namespaceLost = false;
  let clearingAuthentication = false;
  let retryFirstAttachment = retryConnection;
  let firstSessionAttempt: true | undefined = true;
  let firstStart: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  let openingController: AbortController | null = null;
  let nodeEpoch: string | undefined;
  let nodeGeneration = 0;
  let recoveryCallback: RpcStub<
    (error: IZerospinErrorJson) => Promise<void>
  > | null = null;
  let journalBootstrap: RpcStub<IServiceNodeUpgradeJournal> | null = null;
  let attachmentAvailable = false;
  let api: RpcStub<ServiceSharedWorkerApi> | null = null;
  let node: RpcStub<IServiceBrowserSessionApi> | null = null;
  let releasePort = () => {};
  let callback: RpcStub<
    Required<Parameters<ServiceNode['subscribe']>[1]>
  > | null = null;
  let generation = 0;
  let opening: Promise<void> | null = null;
  let lifetime: AbortController | null = null;
  let selectedKey: string | undefined;
  let boundClaims = expectedClaims;
  let lastState: IServiceNodeSnapshot['state'] | null = null;
  let removeListeners = () => {};
  let admission: RpcStub<() => Promise<IAdmissionRequest>>;

  const closeConnection = (retainWorkerLease = false) => {
    attachmentAvailable = false;
    let failure: { error: unknown } | undefined;
    const attempt = (release: () => void) => {
      try {
        release();
      } catch (error) {
        failure ??= { error };
      }
    };
    attempt(removeListeners);
    removeListeners = () => {};
    attempt(() => lifetime?.abort());
    lifetime = null;
    attempt(() => callback?.[Symbol.dispose]());
    attempt(() => recoveryCallback?.[Symbol.dispose]());
    recoveryCallback = null;
    attempt(() => journalBootstrap?.[Symbol.dispose]());
    journalBootstrap = null;
    callback = null;
    const closeNode = node;
    node = null;
    const closeApi = api;
    api = null;
    const closePort = releasePort;
    releasePort = () => {};
    const releaseWorker = () => {
      attempt(() => closeNode?.[Symbol.dispose]());
      attempt(() => closeApi?.[Symbol.dispose]());
      attempt(closePort);
      if (failure !== undefined) {
        throw ensureZerospinError({
          code: 'node-connection-release-failed',
          error: failure.error,
        });
      }
    };
    if (retainWorkerLease && failure === undefined) return releaseWorker;
    releaseWorker();
    return undefined;
  };
  const open = (replacingHistory = false): Promise<void> => {
    if (signedOut) return Promise.reject(makeZerospinError('node-signed-out'));
    if (namespaceLost) {
      return Promise.reject(makeZerospinError('node-connection-unavailable'));
    }
    if (disposed) {
      return Promise.reject(makeZerospinError({ code: 'node-tab-detached' }));
    }
    if (opening !== null) return opening;
    const retryAttachment = retryFirstAttachment;
    retryFirstAttachment = undefined;
    const newSessionAttempt = firstSessionAttempt;
    firstSessionAttempt = undefined;
    const current = ++generation;
    const startup = makeWorkerConnectionDiagnostics({
      sharedWorkerUrl,
      sessionName: request.sessionName,
      recordPhase:
        diagnostics === undefined
          ? undefined
          : (phase, durationMs, outcome, errorCode) =>
              diagnostics.recordPhase(
                phase,
                durationMs,
                outcome === 'success' ? 'ready' : 'failed',
                errorCode,
              ),
    });
    startup.step('worker.routing');
    let attachingSharedWorker = false;
    // The retired capability holds the host lease until the new attachment is ready.
    let releaseRetiredWorker: (() => void) | undefined;
    const work = (async () => {
      releaseRetiredWorker = closeConnection(replacingHistory);
      const controller = new AbortController();
      openingController = controller;
      const signal = controller.signal;
      const routingKey = await awaitConnectionStep(
        makeServiceSharedWorkerRoutingKey(request),
        signal,
      );
      if (disposed || generation !== current) return;
      startup.complete('worker.routing');
      const name = makeServiceSharedWorkerName(routingKey);
      attachingSharedWorker = true;
      const ready = Promise.withResolvers<void>();
      void ready.promise.catch(() => undefined);
      let broken = false;
      let retired = false;
      let replacementAnnounced = false;
      let awaitingReplacementReady = false;
      let deliveryEpoch = 0;
      let minimumDeliveryGeneration = 0;
      const lost = (event?: unknown) => {
        if (disposed || generation !== current || broken || retired) return;
        if (clearingAuthentication) return;
        if (signedOut) {
          closeConnection();
          return;
        }
        startup.fail({ reason: 'rpc-disconnected', event });
        broken = true;
        attachmentAvailable = false;
        const error =
          event instanceof ErrorEvent && event.error != null
            ? event.error
            : event instanceof Error
              ? event
              : makeZerospinError('node-connection-unavailable');
        ready.reject(error);
        controller.abort();
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
          blockedWork: lastState?.blockedWork ?? false,
          failure: lastState?.failure ?? null,
          admissionRejection: lastState?.admissionRejection ?? null,
        });
      };
      const startupTimeout = setTimeout(() => {
        if (
          disposed ||
          signedOut ||
          generation !== current ||
          broken ||
          retired ||
          clearingAuthentication ||
          signal.aborted
        ) {
          return;
        }
        startup.fail({ reason: 'startup-timeout', timeoutMs: 15000 });
        lost();
      }, 15000);
      removeListeners = () => {
        retired = true;
        clearTimeout(startupTimeout);
      };
      const acquired = await acquireWorkerPort({
        sharedWorkerUrl,
        name,
        signal,
        onError: lost,
        diagnostics: startup,
      });
      releasePort = acquired.close;
      if (disposed || signedOut || generation !== current || broken) {
        acquired.close();
        return;
      }
      const { port, artifactUrl } = acquired;
      const connection = newMessagePortRpcSession<ServiceSharedWorkerApi>(
        port,
        undefined,
        { onSendError: publicRpcError },
      );
      api = connection;
      connection.onRpcBroken(lost);
      startup.step('rpc.ready');
      const workerReady = await awaitConnectionStep(
        connection.ready().catch(restoreRpcError),
        signal,
      );
      startup.complete('rpc.ready');
      startup.step('worker.validate');
      assertWorkerArtifact(artifactUrl, workerReady);
      if (workerReady.version !== sharedWorkerVersion) {
        throw makeZerospinError({ code: 'node-worker-version-mismatch' });
      }
      startup.complete('worker.validate');
      // The ready worker owns authentication and socket deadlines during attachment.
      clearTimeout(startupTimeout);
      recoveryCallback = new RpcStub(async (error: IZerospinErrorJson) => {
        if (
          disposed ||
          signedOut ||
          generation !== current ||
          broken ||
          clearingAuthentication
        ) {
          return;
        }
        if (error.code === 'node-development-history-replaced') {
          // Fence this tab's old deliveries before discarding its in-memory view. The old
          // journal remains scoped to its producer, and other tabs can reattach independently.
          const retiredGeneration = ++generation;
          attachmentAvailable = false;
          nodeEpoch = undefined;
          nodeGeneration += 1;
          ready.resolve();
          await replica.reset({ preservePending: false });
          if (
            disposed ||
            signedOut ||
            clearingAuthentication ||
            generation !== retiredGeneration
          ) {
            return;
          }
          opening = null;
          void open(true).catch(() => undefined);
          return;
        }
        replica.recoveryWarning({ error });
      });
      journalBootstrap = makeServiceNodeUpgradeJournal({
        request,
        expectedClaims,
        isCurrent: () =>
          !disposed &&
          !signedOut &&
          generation === current &&
          !broken &&
          !signal.aborted,
      });
      startup.step('node.attachment');
      const attached = await awaitConnectionStep(
        connection
          .attach(
            {
              request,
              ...(boundClaims === undefined
                ? {}
                : { expectedClaims: boundClaims }),
              retryConnection: retryAttachment,
              newSessionAttempt,
            },
            admission,
            recoveryCallback,
            journalBootstrap,
          )
          .catch(restoreRpcError),
        signal,
      );
      startup.complete('node.attachment');
      startup.step('replica.delivery');
      if (disposed || signedOut || generation !== current || broken) {
        attached[Symbol.dispose]();
        return;
      }
      node = attached;
      attachingSharedWorker = false;
      const receive = new RpcStub({
        reset: async (options?: {
          preservePending?: boolean;
          generation?: number;
        }) => {
          if (disposed || signedOut || generation !== current || broken) return;
          attachmentAvailable = false;
          replacementAnnounced = true;
          minimumDeliveryGeneration =
            options?.generation ?? minimumDeliveryGeneration + 1;
          nodeGeneration += 1;
          awaitingReplacementReady = true;
          deliveryEpoch += 1;
          await replica.reset(options);
        },
        view: async (
          snapshot: IServiceNodeSnapshot,
          deliveryGeneration = 0,
        ) => {
          if (disposed || signedOut || generation !== current || broken) return;
          if (deliveryGeneration < minimumDeliveryGeneration) return;
          const receivedEpoch = deliveryEpoch;
          try {
            const definition = await makeServiceNodeDefinition(
              request,
              snapshot.identity.claims,
            );
            if (!isEqual(snapshot.identity, definition.identity)) {
              throw makeZerospinError('node-authentication-identity-mismatch');
            }
            assertSessionClaims(expectedClaims, snapshot.identity.claims);
            const key = await sessionKey(definition.identity);
            if (
              disposed ||
              signedOut ||
              generation !== current ||
              broken ||
              receivedEpoch !== deliveryEpoch ||
              deliveryGeneration < minimumDeliveryGeneration
            ) {
              return;
            }
            if (selectedKey !== undefined && selectedKey !== key) {
              throw makeZerospinError('node-authentication-identity-mismatch');
            }
            selectedKey = key;
            boundClaims = definition.identity.claims;
            if (lifetime === null) {
              lifetime = new AbortController();
              void navigator.locks
                .request(
                  `${makeServiceNodeNamespace(key)}:lifetime`,
                  { mode: 'shared', signal: lifetime.signal },
                  () => {
                    namespaceLost = true;
                    if (
                      !disposed &&
                      !signedOut &&
                      generation === current &&
                      !broken &&
                      !retired &&
                      !clearingAuthentication &&
                      !signal.aborted
                    ) {
                      startup.fail({ reason: 'namespace-lost' });
                    }
                    lost();
                  },
                )
                .catch(() => undefined);
            }
            if (
              !replacementAnnounced &&
              nodeEpoch !== undefined &&
              nodeEpoch !== snapshot.metadata.nodeId
            ) {
              const error = makeZerospinError('node-epoch-changed');
              startup.fail({ reason: 'exception', error });
              onProtocolFailure(error);
              throw error;
            }
            nodeEpoch = snapshot.metadata.nodeId;
            await replica.view(snapshot);
            if (
              disposed ||
              signedOut ||
              generation !== current ||
              broken ||
              receivedEpoch !== deliveryEpoch
            ) {
              return;
            }
            replacementAnnounced = false;
            lastState = snapshot.state;
            replica.state(snapshot.state);
            if (
              awaitingReplacementReady &&
              snapshot.state.synchronization === 'online' &&
              !snapshot.state.blockedWork
            ) {
              awaitingReplacementReady = false;
              attachmentAvailable = true;
              await replica.attachmentReady();
            }
            ready.resolve();
          } catch (error) {
            if (receivedEpoch !== deliveryEpoch) return;
            if (
              !disposed &&
              !signedOut &&
              generation === current &&
              !broken &&
              !retired &&
              !clearingAuthentication &&
              !signal.aborted
            ) {
              startup.fail({ reason: 'exception', error });
            }
            onProtocolFailure(error);
            ready.reject(error);
            lost();
            throw error;
          }
        },
        state: async (
          received: Parameters<
            Parameters<ServiceNode['subscribe']>[1]['state']
          >[0],
          deliveryGeneration = 0,
        ) => {
          if (disposed || generation !== current) return;
          if (received.authentication === 'signed-out') {
            signedOut = true;
            attachmentAvailable = false;
            lastState = received;
            replica.state(received);
            return;
          }
          if (broken || signedOut) return;
          if (deliveryGeneration < minimumDeliveryGeneration) return;
          if (
            !replacementAnnounced &&
            nodeEpoch !== undefined &&
            received.nodeId !== nodeEpoch
          ) {
            return;
          }
          if (
            replacementAnnounced &&
            received.failure === null &&
            received.authentication !== 'signed-out'
          ) {
            return;
          }
          lastState = received;
          replica.state(received);
          if (
            awaitingReplacementReady &&
            !replacementAnnounced &&
            received.synchronization === 'online' &&
            !received.blockedWork
          ) {
            awaitingReplacementReady = false;
            attachmentAvailable = true;
            await replica.attachmentReady();
          }
        },
      });
      callback = receive;
      await awaitConnectionStep(
        attached
          .subscribe({ pendingCommands: replica.pendingCommands() }, receive)
          .catch(restoreRpcError),
        signal,
      );
      await awaitConnectionStep(ready.promise, signal);
      if (disposed || signedOut || generation !== current || broken) return;
      clearTimeout(startupTimeout);
      if (!awaitingReplacementReady) {
        attachmentAvailable = true;
        await replica.attachmentReady();
      }
      startup.complete('replica.delivery');
      startup.step('connection.active');
    })().then(
      () => releaseRetiredWorker?.(),
      error => {
        try {
          releaseRetiredWorker?.();
        } catch {
          // The failed successor attachment owns the first failure.
        }
        throw error;
      },
    );
    opening = work;
    void work
      .catch(error => {
        if (disposed || generation !== current || clearingAuthentication)
          return;
        try {
          closeConnection();
        } catch {
          // The originating error owns this failed connection.
        }
        const code =
          error instanceof Error && 'code' in error ? String(error.code) : null;
        if (code === 'node-signed-out') signedOut = true;
        if (
          code === 'node-authentication-cancelled' &&
          !disposed &&
          !signal.aborted
        ) {
          namespaceLost = true;
        }
        if (code === 'node-synchronization-blocked') {
          if (lastState !== null) replica.state(lastState);
          return;
        }
        if (
          code !== null &&
          [
            'node-tab-detached',
            'node-authentication-cancelled',
            'node-signed-out',
          ].includes(code)
        ) {
          return;
        }
        if (!signal.aborted && !signedOut) {
          startup.fail({ reason: 'exception', error });
        }
        const authenticationRejected =
          (error instanceof Error &&
            'status' in error &&
            Schema.is(AuthenticationRejectedHttpStatusSchema)(error.status)) ||
          [
            'node-authentication-rejected',
            'authentication-credentials-invalid',
            'admission-credentials-required',
            'node-authentication-identity-mismatch',
            'session-claims-mismatch',
          ].includes(String(code));
        const persistenceFailed = code?.startsWith('node-storage-') === true;
        if (
          !attachingSharedWorker &&
          !authenticationRejected &&
          !persistenceFailed &&
          isBrowserOffline()
        ) {
          return;
        }
        if (
          attachingSharedWorker &&
          !authenticationRejected &&
          !persistenceFailed
        ) {
          replica.connectionFailed({ error });
        } else {
          onProtocolFailure(error);
        }
        replica.state({
          localAvailability: persistenceFailed
            ? 'failed'
            : attachingSharedWorker
              ? 'unavailable'
              : 'available',
          authentication: authenticationRejected ? 'rejected' : 'unavailable',
          synchronization: 'blocked',
          blockedWork: true,
          failure: encodeNodeFailure('node-connection-failed', error),
          admissionRejection: null,
        });
      })
      .finally(() => {
        if (opening === work) opening = null;
      })
      .catch(() => undefined);
    return work;
  };
  const resume = () => {
    if (
      signedOut ||
      namespaceLost ||
      lastState?.admissionRejection != null ||
      lastState?.authentication === 'signed-out'
    ) {
      return;
    }
    if (!disposed && document.visibilityState !== 'hidden') {
      void (
        node === null ? open() : node.resume().catch(restoreRpcError)
      ).catch(error => {
        const code =
          error instanceof Error && 'code' in error ? error.code : null;
        if (code === 'node-signed-out') signedOut = true;
        if (
          code === 'node-authentication-cancelled' &&
          !disposed &&
          !signal.aborted
        ) {
          namespaceLost = true;
        }
        if (
          disposed ||
          code === 'node-signed-out' ||
          code === 'node-tab-detached' ||
          code === 'node-authentication-cancelled'
        ) {
          return;
        }
        if (!isBrowserOffline()) onProtocolFailure(error);
      });
    }
  };
  const dispose = () => {
    if (disposal !== null) return disposal;
    const completion = Promise.withResolvers<void>();
    disposal = completion.promise;
    disposed = true;
    generation += 1;
    openingController?.abort();
    window.removeEventListener('online', resume);
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
    signal.removeEventListener('abort', abort);
    void (async () => {
      let first: unknown;
      try {
        closeConnection();
      } catch (error) {
        first = error;
      }
      try {
        admission?.[Symbol.dispose]();
      } catch (error) {
        first ??= error;
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
  const connection = {
    journalIdentityKey: () => selectedKey,
    stagedCommandAttachment: (
      expectedNodeId: string,
    ): ReturnType<IServiceReplicaConnection['stagedCommandAttachment']> => {
      if (
        disposed ||
        !attachmentAvailable ||
        node === null ||
        nodeEpoch !== expectedNodeId
      ) {
        return null;
      }
      const attached = node;
      const attachedGeneration = generation;
      const attachedNodeGeneration = nodeGeneration;
      return {
        subscriber: () => attached.getStagedCommandSubscriber(expectedNodeId),
        isCurrent: () =>
          !disposed &&
          attachmentAvailable &&
          node === attached &&
          generation === attachedGeneration &&
          nodeGeneration === attachedNodeGeneration &&
          nodeEpoch === expectedNodeId,
      };
    },
    start: (receiving: IServiceReplica) =>
      Effect.gen(function* () {
        if (firstStart !== null) {
          const pending = firstStart;
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
        admission = new RpcStub<() => Promise<IAdmissionRequest>>(async () =>
          admissionValue(await getAdmission()),
        );
        signal.addEventListener('abort', abort, { once: true });
        window.addEventListener('online', resume);
        window.addEventListener('pageshow', resume);
        window.addEventListener('focus', resume);
        document.addEventListener('visibilitychange', resume);
        const ready = open();
        firstStart = ready;
        const awaitReady = Effect.tryPromise({
          try: () => ready,
          catch: cause => {
            if (isZerospinError(cause)) return cause;
            throw cause;
          },
        });
        yield* awaitReady;
      }),
    clearAuthentication: Effect.tryPromise({
      try: async () => {
        const attached = node;
        signedOut = true;
        clearingAuthentication = true;
        attachmentAvailable = false;
        // Aborting startup closes the port used by an attached session.
        if (attached === null) openingController?.abort();
        if (lastState !== null) {
          lastState = {
            ...lastState,
            authentication: 'signed-out',
            synchronization: 'offline',
            blockedWork: true,
          };
          replica.state(lastState);
        }
        try {
          await attached?.clearAuthentication().catch(restoreRpcError);
        } finally {
          openingController?.abort();
          clearingAuthentication = false;
          closeConnection();
        }
      },
      catch: cause => {
        if (isZerospinError(cause)) return cause;
        throw cause;
      },
    }),
  };
  return connection;
}
