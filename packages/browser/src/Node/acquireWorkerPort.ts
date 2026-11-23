import { makeZerospinError } from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from './awaitConnectionStep.ts';
import {
  makeWorkerConnectionDiagnostics,
  type IWorkerConnectionDiagnostics,
} from './makeWorkerConnectionDiagnostics.ts';

export const WorkerClientSchema = Schema.Struct({
  type: Schema.Literal('zerospin-client'),
  clientId: Schema.String.check(Schema.isUUID(4)),
});

export const WorkerClientReplySchema = Schema.Struct({
  type: Schema.Literals([
    'zerospin-client-accepted',
    'zerospin-client-rejected',
  ]),
  clientId: Schema.String.check(Schema.isUUID(4)),
});

/** Hold document liveness before startup, then bootstrap the port before RPC. */
export async function acquireWorkerPort(props: {
  sharedWorkerUrl: string;
  name: string;
  signal: AbortSignal;
  onError: (event?: unknown) => void;
  diagnostics?: IWorkerConnectionDiagnostics | undefined;
}): Promise<{
  worker: SharedWorker;
  port: MessagePort;
  artifactUrl: string;
  close(): void;
}> {
  const { sharedWorkerUrl, name, signal, onError } = props;
  const diagnostics =
    props.diagnostics ??
    makeWorkerConnectionDiagnostics({ sharedWorkerUrl, sessionName: name });
  const clientId = crypto.randomUUID();
  diagnostics.clientId = clientId;
  const acquired = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const accepted = Promise.withResolvers<void>();
  const controller = new AbortController();
  let worker: SharedWorker | null = null;
  let port: MessagePort | null = null;
  let closed = false;
  void acquired.promise.catch(() => undefined);
  void accepted.promise.catch(() => undefined);
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    released.resolve();
    signal.removeEventListener('abort', close);
    worker?.removeEventListener('error', workerError);
    port?.removeEventListener('messageerror', messageError);
    port?.removeEventListener('message', receive);
    port?.close();
    accepted.reject(makeZerospinError('node-tab-detached'));
  };
  const fail = (event?: unknown, reason = 'exception') => {
    if (closed) return;
    if (!signal.aborted) diagnostics.fail({ reason, event });
    const error =
      event instanceof ErrorEvent && event.error != null
        ? event.error
        : event instanceof Error
          ? event
          : makeZerospinError('node-connection-unavailable');
    accepted.reject(error);
    try {
      onError(event);
    } finally {
      close();
    }
  };
  const workerError = (event: Event) => fail(event, 'worker-error');
  const messageError = (event: MessageEvent<unknown>) =>
    fail(event, 'message-error');
  const receive = (event: MessageEvent<unknown>) => {
    try {
      const reply = Schema.decodeUnknownSync(WorkerClientReplySchema)(
        event.data,
        { onExcessProperty: 'error' },
      );
      if (reply.clientId !== clientId) {
        fail(undefined, 'client-reply-mismatch');
        return;
      }
      if (reply.type === 'zerospin-client-rejected') {
        fail(
          makeZerospinError('node-connection-release-failed'),
          'client-rejected',
        );
        return;
      }
      diagnostics.complete('client.bootstrap');
      accepted.resolve();
    } catch {
      fail(undefined, 'invalid-client-reply');
    }
  };
  signal.addEventListener('abort', close, { once: true });
  let failureReason = 'lock-failed';
  try {
    if (signal.aborted) throw makeZerospinError('node-tab-detached');
    diagnostics.step('lock.acquire');
    const lifetime = navigator.locks.request(
      `zerospin:worker-client:${clientId}`,
      { mode: 'exclusive', signal: controller.signal },
      () => {
        if (closed) return;
        acquired.resolve();
        return released.promise;
      },
    );
    void lifetime.catch(error => acquired.reject(error));
    await awaitConnectionStep(acquired.promise, signal);
    if (closed) throw makeZerospinError('node-tab-detached');
    diagnostics.complete('lock.acquire');
    diagnostics.step('worker.construct');
    failureReason = 'constructor-failed';
    const artifactUrl = new URL(sharedWorkerUrl, globalThis.location.href).href;
    worker = new SharedWorker(artifactUrl, { type: 'module', name });
    port = worker.port;
    diagnostics.complete('worker.construct');
    worker.addEventListener('error', workerError);
    port.addEventListener('messageerror', messageError);
    port.addEventListener('message', receive);
    port.start();
    diagnostics.step('client.bootstrap');
    failureReason = 'bootstrap-send-failed';
    port.postMessage({ type: 'zerospin-client', clientId });
    failureReason = 'exception';
    await accepted.promise;
    if (closed) throw makeZerospinError('node-tab-detached');
    port.removeEventListener('message', receive);
    return { worker, port, artifactUrl, close };
  } catch (error) {
    if (!closed && !signal.aborted) {
      diagnostics.fail({ reason: failureReason, error });
    }
    close();
    throw error;
  }
}
