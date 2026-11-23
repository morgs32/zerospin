import { newMessagePortRpcSession, type RpcTarget } from 'capnweb';
import * as Schema from 'effect/Schema';

import { WorkerClientSchema } from './acquireWorkerPort.ts';
import { reportWorkerConnectionFailure } from './makeWorkerConnectionDiagnostics.ts';
import { publicRpcError } from './publicRpcError.ts';

/** Retain the host listener; each live client group owns one closeable runtime. */
export function makeWorkerConnections(
  createOwner: () => {
    createApi(): RpcTarget & Disposable;
    close(connections: { close(): void }): Promise<void>;
  },
) {
  const ports = new Set<() => void>();
  const clients = new Set<string>();
  const waiting = new Set<() => void>();
  let owner:
    | {
        runtime: ReturnType<typeof createOwner>;
        ports: Set<() => void>;
        failed: boolean;
        failure?: unknown;
      }
    | undefined;
  let closing: Promise<void> | undefined;
  let closed: Promise<void> | undefined;
  let stopped = false;
  let failed = false;
  let failure: unknown;

  const closeOwner = () => {
    if (closing !== undefined) return closing;
    const current = owner;
    if (current === undefined) {
      return failed ? Promise.reject(failure) : Promise.resolve();
    }
    // Fence acquisition before any per-port revocation can reenter cleanup.
    owner = undefined;
    const completion = Promise.withResolvers<void>();
    closing = completion.promise;
    void closing.catch(() => undefined);
    void Promise.resolve()
      .then(() =>
        current.runtime.close({
          close() {
            for (const close of current.ports) close();
            if (current.failed) throw current.failure;
          },
        }),
      )
      .then(
        () => {
          closing = undefined;
          completion.resolve();
        },
        error => {
          reportWorkerConnectionFailure({
            scope: 'worker',
            phase: 'owner.close',
            reason: 'owner-release-failed',
            sharedWorkerUrl: globalThis.location?.href,
            error,
          });
          failed = true;
          failure = error;
          for (const reject of waiting) reject();
          completion.reject(error);
        },
      );
    return completion.promise;
  };

  const connect = (event: Event) => {
    if (!(event instanceof MessageEvent)) return;
    const port = event.ports[0];
    if (port === undefined) return;
    if (stopped) {
      port.close();
      return;
    }
    let active = true;
    let clientId: string | undefined;
    let currentOwner: typeof owner;
    let releaseApi = () => {};
    let releaseRpc = () => {};
    const watcher = new AbortController();
    const timeout = setTimeout(() => close(), 15000);
    const messageError = (event: MessageEvent<unknown>) => {
      if (!active || stopped) return;
      reportWorkerConnectionFailure({
        scope: 'worker',
        phase: 'client.bootstrap',
        reason: 'message-error',
        sharedWorkerUrl: globalThis.location?.href,
        clientId,
        event,
      });
      close();
    };
    const close = () => {
      if (!active) return;
      active = false;
      ports.delete(close);
      waiting.delete(reject);
      if (clientId !== undefined) clients.delete(clientId);
      const current = currentOwner;
      currentOwner = undefined;
      current?.ports.delete(close);
      let first: unknown;
      let errored = false;
      for (const release of [
        () => clearTimeout(timeout),
        () => watcher.abort(),
        () => port.removeEventListener('message', bootstrap),
        () => port.removeEventListener('messageerror', messageError),
        () => releaseApi(),
        () => releaseRpc(),
        () => port.close(),
      ]) {
        try {
          release();
        } catch (error) {
          if (!errored) {
            errored = true;
            first = error;
          }
        }
      }
      if (errored && current !== undefined && !current.failed) {
        current.failed = true;
        current.failure = first;
      }
      if (
        current !== undefined &&
        current.ports.size === 0 &&
        owner === current
      ) {
        void closeOwner().catch(() => undefined);
      }
    };
    const reject = () => {
      if (!active) return;
      try {
        if (clientId !== undefined) {
          port.postMessage({ type: 'zerospin-client-rejected', clientId });
        }
      } catch {
        // A broken waiting port cannot prevent other clients from retiring.
      } finally {
        close();
      }
    };
    const bootstrap = (message: MessageEvent<unknown>) => {
      if (!active || clientId !== undefined) return;
      let input: typeof WorkerClientSchema.Type;
      try {
        input = Schema.decodeUnknownSync(WorkerClientSchema)(message.data, {
          onExcessProperty: 'error',
        });
      } catch {
        reportWorkerConnectionFailure({
          scope: 'worker',
          phase: 'client.bootstrap',
          reason: 'invalid-client-bootstrap',
          sharedWorkerUrl: globalThis.location?.href,
        });
        close();
        return;
      }
      if (clients.has(input.clientId)) {
        reportWorkerConnectionFailure({
          scope: 'worker',
          phase: 'client.bootstrap',
          reason: 'duplicate-client',
          sharedWorkerUrl: globalThis.location?.href,
          clientId: input.clientId,
        });
        // Do not remove the original client's identity when rejecting a duplicate.
        try {
          port.postMessage({
            type: 'zerospin-client-rejected',
            clientId: input.clientId,
          });
        } catch {
          // Rejection is best effort when the peer has already disappeared.
        }
        close();
        return;
      }
      clientId = input.clientId;
      clients.add(clientId);
      waiting.add(reject);
      clearTimeout(timeout);
      port.removeEventListener('message', bootstrap);
      if (failed || stopped) {
        reject();
        return;
      }
      // The page holds this unique lock before constructing the worker. Its
      // release also detects document loss without a cooperative RPC close.
      void navigator.locks
        .request(
          `zerospin:worker-client:${clientId}`,
          { mode: 'exclusive', signal: watcher.signal },
          close,
        )
        .catch(error => {
          if (!watcher.signal.aborted && active && !stopped) {
            reportWorkerConnectionFailure({
              scope: 'worker',
              phase: 'client.liveness',
              reason: 'lock-error',
              sharedWorkerUrl: globalThis.location?.href,
              clientId,
              error,
            });
          }
          close();
        });
      let phase = 'owner.release';
      void (async () => {
        if (closing !== undefined) await closing;
        // A client lost while the previous owner drained cannot reopen storage.
        if (!active) return;
        if (failed || stopped) {
          reject();
          return;
        }
        if (owner === undefined) {
          phase = 'owner.construct';
          try {
            owner = {
              runtime: createOwner(),
              ports: new Set(),
              failed: false,
            };
          } catch (error) {
            reportWorkerConnectionFailure({
              scope: 'worker',
              phase,
              reason: 'owner-construction-failed',
              sharedWorkerUrl: globalThis.location?.href,
              clientId,
              error,
            });
            failed = true;
            failure = error;
            for (const reject of waiting) reject();
            return;
          }
        }
        const current = owner;
        currentOwner = current;
        current.ports.add(close);
        try {
          phase = 'api.construct';
          const api = current.runtime.createApi();
          releaseApi = () => api[Symbol.dispose]();
          phase = 'rpc.initialize';
          const session = newMessagePortRpcSession(port, api, {
            onSendError: publicRpcError,
          });
          releaseRpc = () => session[Symbol.dispose]();
          session.onRpcBroken(close);
          phase = 'client.accept';
          port.postMessage({ type: 'zerospin-client-accepted', clientId });
          waiting.delete(reject);
        } catch (error) {
          reportWorkerConnectionFailure({
            scope: 'worker',
            phase,
            reason:
              phase === 'api.construct'
                ? 'api-construction-failed'
                : 'bootstrap-failed',
            sharedWorkerUrl: globalThis.location?.href,
            clientId,
            error,
          });
          if (!current.failed) {
            current.failed = true;
            current.failure = error;
          }
          reject();
        }
      })().catch(error => {
        if (active && !stopped) {
          reportWorkerConnectionFailure({
            scope: 'worker',
            phase,
            reason: 'bootstrap-failed',
            sharedWorkerUrl: globalThis.location?.href,
            clientId,
            error,
          });
        }
        reject();
      });
    };
    ports.add(close);
    port.addEventListener('message', bootstrap);
    port.addEventListener('messageerror', messageError);
    port.start();
  };

  globalThis.addEventListener('connect', connect);
  return {
    close(): Promise<void> {
      if (closed !== undefined) return closed;
      stopped = true;
      globalThis.removeEventListener('connect', connect);
      for (const close of ports) close();
      closed = closeOwner();
      return closed;
    },
  };
}
