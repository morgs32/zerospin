import type {
  IAgentConnectionState,
  IAgentSessionBootstrap,
} from '@zerospin/core/agent/types';
import type { ISessionFailureReporter } from '@zerospin/core/sessionFailure/types';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Queue from 'effect/Queue';

import { isBrowserOffline } from '../Node/isBrowserOffline.ts';
import { makeSocketAttempt } from '../Node/makeSocketAttempt.ts';

type IAgentTransportEvent =
  | { type: 'open' | 'replay-timeout' }
  | { type: 'message'; data: unknown }
  | { type: 'disconnected'; error: Error };

/** An Agent Session only subscribes and resumes observation; it never schedules or submits commands. */
export function synchronizeAgentNode(props: {
  reportFailure: ISessionFailureReporter;
  signal: AbortSignal;
  hasBaseline(): boolean;
  bootstrap(signal: AbortSignal): Promise<IAgentSessionBootstrap>;
  installBootstrap(bootstrap: IAgentSessionBootstrap): void;
  resumeMessage(): string;
  receive(data: unknown): boolean;
  setConnection(connection: IAgentConnectionState): void;
}) {
  const hasBaseline = props.hasBaseline.bind(props);
  const requestBootstrap = props.bootstrap.bind(props);
  const installBootstrap = props.installBootstrap.bind(props);
  const resumeMessage = props.resumeMessage.bind(props);
  const receive = props.receive.bind(props);
  const setConnection = props.setConnection.bind(props);
  const { signal, reportFailure } = props;
  return Effect.gen(function* () {
    if (signal.aborted) return yield* Effect.interrupt;
    const firstReplay = yield* Deferred.make<void, unknown>();
    const active = () => !signal.aborted;
    const canRetry = (cause: Cause.Cause<unknown>) => {
      if (Cause.hasDies(cause) || !isBrowserOffline()) return false;
      const error = Cause.squash(cause);
      return (
        isZerospinError(error) &&
        [
          'rpc-invocation-failed',
          'user-authentication-transport-failed',
          'node-backend-timeout',
          'node-backend-unreachable',
          'node-subscription-closed',
          'node-subscription-timeout',
        ].includes(error.code)
      );
    };
    const connect = Effect.scoped(
      Effect.gen(function* () {
        const attempt = yield* Effect.acquireRelease(
          Effect.sync(() => makeSocketAttempt(active)),
          owned => Effect.promise(() => owned.stop()),
        );
        const events = yield* Effect.acquireRelease(
          Queue.unbounded<IAgentTransportEvent>(),
          Queue.shutdown,
        );
        const offer = (event: IAgentTransportEvent) => {
          if (attempt.active()) Queue.offerUnsafe(events, event);
        };
        const abort = () => {
          void attempt.stop().catch(() => undefined);
        };
        signal.addEventListener('abort', abort, { once: true });
        attempt.own(() => signal.removeEventListener('abort', abort));
        setConnection({
          status: hasBaseline() ? 'reconnecting' : 'loading',
          error: null,
        });
        if (!attempt.active()) return yield* Effect.interrupt;
        const bootstrap = yield* Effect.tryPromise({
          try: () => attempt.wait(requestBootstrap(attempt.signal)),
          catch: error => {
            if (isZerospinError(error)) return error;
            throw error;
          },
        });
        if (!attempt.active()) return yield* Effect.interrupt;
        installBootstrap(bootstrap);
        if (!attempt.active()) return yield* Effect.interrupt;
        setConnection({ status: 'connecting', error: null });
        if (!attempt.active()) return yield* Effect.interrupt;
        const socket = new WebSocket(bootstrap.webSocketUrl);
        const onOpen = () => offer({ type: 'open' });
        const onMessage = (event: MessageEvent) =>
          offer({ type: 'message', data: event.data });
        const disconnected = () =>
          offer({
            type: 'disconnected',
            error: makeZerospinError('node-subscription-closed'),
          });
        socket.addEventListener('open', onOpen);
        socket.addEventListener('message', onMessage);
        socket.addEventListener('error', disconnected);
        socket.addEventListener('close', disconnected);
        attempt.own(() => {
          socket.removeEventListener('open', onOpen);
          socket.removeEventListener('message', onMessage);
          socket.removeEventListener('error', disconnected);
          socket.removeEventListener('close', disconnected);
          socket.close();
        });
        let replayTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
          () => offer({ type: 'replay-timeout' }),
          15000,
        );
        attempt.own(() => clearTimeout(replayTimer));
        let live = false;
        while (attempt.active()) {
          const event = yield* Queue.take(events);
          if (!attempt.active()) return yield* Effect.interrupt;
          if (event.type === 'disconnected') {
            return yield* Effect.fail(event.error);
          }
          if (event.type === 'replay-timeout') {
            if (live) continue;
            return yield* Effect.fail(
              makeZerospinError('node-subscription-timeout'),
            );
          }
          if (event.type === 'open') {
            yield* Effect.try({
              try: () => socket.send(resumeMessage()),
              catch: () => makeZerospinError('node-subscription-closed'),
            });
          } else if (event.type === 'message' && receive(event.data)) {
            if (!attempt.active()) return yield* Effect.interrupt;
            clearTimeout(replayTimer);
            replayTimer = undefined;
            live = true;
            Deferred.doneUnsafe(firstReplay, Effect.void);
          }
        }
      }),
    );
    const owner = Effect.gen(function* () {
      while (active()) {
        const exit = yield* Effect.exit(connect);
        if (!active()) return;
        if (Exit.isFailure(exit)) {
          if (Cause.hasInterruptsOnly(exit.cause)) {
            Deferred.doneUnsafe(firstReplay, Effect.failCause(exit.cause));
            return yield* Effect.failCause(exit.cause);
          }
          const error = Cause.squash(exit.cause);
          const connectionError =
            error instanceof Error ? error : new Error(String(error));
          if (!canRetry(exit.cause)) {
            setConnection({ status: 'error', error: connectionError });
            Deferred.doneUnsafe(firstReplay, Effect.failCause(exit.cause));
            reportFailure({ origin: 'session', error: exit.cause });
            return yield* Effect.failCause(exit.cause);
          }
          setConnection({
            status: 'reconnecting',
            error: connectionError,
          });
        }
        yield* Effect.sleep('3 seconds');
      }
    });
    yield* Effect.forkScoped(owner);
    yield* Deferred.await(firstReplay);
  });
}
