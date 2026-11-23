import { hasServiceNodeCheckpoint } from '@zerospin/core/ServiceNode/hasServiceNodeCheckpoint';
import type { ServiceNode } from '@zerospin/core/ServiceNode/ServiceNode';
import type { IServiceNodeCommand } from '@zerospin/core/ServiceNode/types';
import { ServiceSocketServerMessageSchema } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import {
  isZerospinError,
  makeZerospinError,
  type IFrameworkError,
} from '@zerospin/error';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { BrowserRpc } from '../Node/BrowserRpc.ts';
import { isBrowserOffline } from '../Node/isBrowserOffline.ts';
import { isNodeAdmissionBackpressure } from '../Node/isNodeAdmissionBackpressure.ts';
import { isNodeAdmissionRejected } from '../Node/isNodeAdmissionRejected.ts';
import { makeSocketAttempt } from '../Node/makeSocketAttempt.ts';
import {
  nodeRpcErrorFor,
  snapshotFailureCodes,
} from '../Node/nodeRpcErrorFor.ts';
import { shouldResetConnectedNode } from '../Node/shouldResetConnectedNode.ts';
import { isDevelopmentSystemStarting } from '../Node/waitForDevelopmentSystem.ts';

import { serviceNodeNetwork } from './serviceNodeNetwork.ts';
import type { IServiceNodeRequest } from './serviceNodeRequest.ts';
import type {
  IServiceNodeAuthentication,
  IVerifiedServiceAdmission,
} from './verifiedServiceAdmission.ts';
type ITicketError = Effect.Error<
  ReturnType<ReturnType<typeof serviceNodeNetwork>['ticketProgram']>
>;
const connectionFailure = nodeRpcErrorFor([
  'node-signed-out',
  'node-synchronization-blocked',
  'node-authentication-rejected',
  'node-authentication-unavailable',
  'node-credentials-timeout',
  'node-local-preparation-timeout',
  'node-backend-timeout',
  'node-backend-unreachable',
  'node-authentication-cancelled',
  'node-authentication-identity-mismatch',
  'node-subscription-timeout',
  'node-subscription-closed',
  'node-subscription-message-invalid',
  'node-checkpoint-conflict',
  'node-state-required',
  'node-baseline-checkpoint-invalid',
  'node-reset-attachment-unsupported',
  'node-reset-attachment-timeout',
  'node-admission-reply-mismatch',
  'node-admission-result-invalid',
  'node-admission-conflict',
  'node-development-history-replaced',
  'node-development-system-starting',
  'node-development-history-mismatch',
  'node-producer-not-registered',
  'node-replay-incomplete',
  'node-execution-checkpoint-invalid',
  'node-execution-gap',
  'node-outcome-conflict',
  'node-command-final-missing',
  'node-index-invalid',
  ...snapshotFailureCodes,
]);
type IConnectionError =
  | ReturnType<typeof connectionFailure>
  | ITicketError
  | IFrameworkError;
const pushFailure = nodeRpcErrorFor([
  'node-offline',
  'node-admission-uncertain',
  'node-signed-out',
  'node-push-blocked',
  'node-metadata-missing',
  'node-command-input-missing',
  'node-command-contract-mismatch',
]);
type IPushError = IConnectionError | ReturnType<typeof pushFailure>;

/** Network calls never hold Node's SQLite transaction boundary. */
export class ServiceNodeSynchronization {
  private socket: WebSocket | null = null;
  private attempt: ReturnType<typeof makeSocketAttempt> | null = null;
  private stopping: Promise<void> | null = null;
  private pushController: AbortController | null = null;
  private connecting: Promise<Exit.Exit<void, IConnectionError>> | null = null;
  private pending: {
    command: Extract<IServiceNodeCommand, { nodeId: string }>;
    resolve(): void;
    reject(error: unknown): void;
  } | null = null;
  private pushing: Promise<
    Exit.Exit<{ status: 'empty' | 'pushed' }, IPushError>
  > | null = null;
  private stopped = false;
  private verifiedLocalHistory = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private connectingNodeId: string | undefined;

  constructor(
    readonly node: Pick<
      ServiceNode,
      | 'authenticated'
      | 'rejectAuthentication'
      | 'connectionState'
      | 'status'
      | 'snapshot'
      | 'nextPush'
      | 'admitted'
      | 'reconcileAdmission'
      | 'admissionRejected'
      | 'receiveCommand'
    >,
    readonly request: IServiceNodeRequest,
    readonly authentication: IServiceNodeAuthentication,
    readonly recover?: (failure: unknown, nodeId?: string) => Promise<boolean>,
    readonly checkHistory?: (
      verified: IVerifiedServiceAdmission,
    ) => Promise<void>,
  ) {}

  async enable() {
    await this.stopping;
    this.stopping = null;
    this.stopped = false;
  }

  resume(verified?: IVerifiedServiceAdmission): Promise<void> {
    return BrowserRpc.run(this.resumeProgram(verified));
  }

  resumeProgram(
    verified?: IVerifiedServiceAdmission,
  ): Effect.Effect<void, IConnectionError> {
    return Effect.suspend(() => {
      if (this.stopped) {
        return Effect.fail(makeZerospinError('node-signed-out'));
      }
      const state = this.node.status();
      if (state.admissionRejection !== null) return Effect.void;
      if (state.blockedWork) {
        const failure =
          state.failure === null
            ? makeZerospinError('node-synchronization-blocked')
            : makeZerospinError(state.failure);
        if (
          this.recover !== undefined &&
          shouldResetConnectedNode({ failure, attempted: false })
        ) {
          return Effect.tryPromise({
            try: async () => {
              if (!(await this.recover!(failure))) throw failure;
            },
            catch: connectionFailure,
          });
        }
        return Effect.fail(makeZerospinError('node-synchronization-blocked'));
      }
      if (isBrowserOffline()) {
        this.socket?.close();
        this.node.connectionState('offline');
        this.scheduleRetry();
        return Effect.void;
      }
      if (this.connecting !== null) {
        const connecting = this.connecting;
        return Effect.promise(() => connecting).pipe(
          Effect.flatMap(exit =>
            Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.void,
          ),
        );
      }
      if (this.socket?.readyState === WebSocket.OPEN) {
        return Effect.void;
      }
      const generation = ++this.generation;
      const previous = this.attempt;
      const attempt = makeSocketAttempt(
        () => generation === this.generation && !this.stopped,
      );
      this.attempt = attempt;
      const program = Effect.promise(async () => {
        await previous?.stop();
      }).pipe(Effect.flatMap(() => this.connect(attempt, verified)));
      const connecting = Effect.runPromiseExit(program, {
        signal: attempt.signal,
      }).then<Exit.Exit<void, IConnectionError>>(async exit => {
        if (Exit.isSuccess(exit)) {
          return exit;
        }
        // The failed connect and delivery queue settle before runtime recovery stops the driver.
        const failure = Cause.squash(exit.cause);
        if (
          !this.stopped &&
          generation === this.generation &&
          shouldResetConnectedNode({ failure, attempted: false }) &&
          this.recover !== undefined
        ) {
          await attempt.stop();
          this.connecting = null;
          try {
            if (await this.recover(failure, this.connectingNodeId)) {
              return Exit.succeed(undefined);
            }
          } catch (error) {
            this.node.connectionState('blocked', error);
            return Effect.runPromiseExit(
              Effect.try({
                try: () => {
                  throw error;
                },
                catch: cause => {
                  if (isZerospinError(cause) && !('scope' in cause)) {
                    return cause;
                  }
                  throw cause;
                },
              }),
            );
          }
        }
        return Effect.runPromiseExit(
          Effect.failCause(exit.cause).pipe(
            Effect.tapCause(cause =>
              Effect.gen({ self: this }, function* () {
                if (this.stopped || generation !== this.generation) {
                  return;
                }
                const error = Cause.squash(cause);
                const code =
                  error instanceof Error && 'code' in error
                    ? String(error.code)
                    : null;
                if (
                  code === 'node-authentication-rejected' ||
                  isNodeAdmissionRejected(error)
                ) {
                  yield* Effect.promise(() => this.node.rejectAuthentication());
                  this.node.connectionState('blocked', error);
                  return;
                }
                const retryable =
                  isNodeAdmissionBackpressure(error) ||
                  [
                    'node-authentication-unavailable',
                    'node-subscription-timeout',
                    'node-subscription-closed',
                    'node-admission-uncertain',
                    'node-offline',
                  ].includes(String(code));
                if (
                  Cause.hasInterruptsOnly(cause) ||
                  code === 'node-authentication-cancelled'
                ) {
                  return;
                }
                if (
                  !Cause.hasDies(cause) &&
                  (isDevelopmentSystemStarting(this.request.apiUrl, error) ||
                    code === 'node-credentials-timeout' ||
                    code === 'node-authentication-unavailable' ||
                    (this.verifiedLocalHistory &&
                      (code === 'node-backend-timeout' ||
                        code === 'node-backend-unreachable' ||
                        code === 'node-subscription-timeout' ||
                        code === 'node-subscription-closed')) ||
                    (isBrowserOffline() &&
                      (retryable ||
                        code === 'node-backend-timeout' ||
                        code === 'node-backend-unreachable' ||
                        code === 'rpc-invocation-failed' ||
                        code === 'user-authentication-transport-failed')))
                ) {
                  this.node.connectionState('offline', error);
                  this.scheduleRetry();
                  return;
                }
                this.node.connectionState('blocked', error);
              }),
            ),
            Effect.ensuring(Effect.promise(() => attempt.stop())),
          ),
        );
      });
      this.connecting = connecting;
      void connecting
        .finally(() => {
          if (this.connecting === connecting) this.connecting = null;
        })
        .catch(() => undefined);
      return Effect.promise(() => connecting).pipe(
        Effect.flatMap(exit =>
          Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.void,
        ),
      );
    });
  }

  private connect(
    attempt: ReturnType<typeof makeSocketAttempt>,
    admitted?: IVerifiedServiceAdmission,
  ): Effect.Effect<void, IConnectionError> {
    return Effect.gen({ self: this }, function* () {
      this.node.connectionState('authenticating');
      const verified =
        admitted ??
        (yield* Effect.tryPromise({
          try: () => attempt.wait(this.authentication.authenticate()),
          catch: connectionFailure,
        }));
      if (this.checkHistory) {
        yield* Effect.tryPromise({
          try: () => attempt.wait(this.checkHistory!(verified)),
          catch: connectionFailure,
        });
      }
      this.verifiedLocalHistory = verified.developmentHistory !== undefined;
      if (!attempt.active()) return;
      yield* Effect.tryPromise({
        try: () => this.node.authenticated(verified.identity, attempt.active),
        catch: connectionFailure,
      });
      if (!attempt.active()) return;
      const before = yield* Effect.tryPromise({
        try: () => this.node.snapshot({ authoritative: true }),
        catch: connectionFailure,
      });
      this.connectingNodeId = before.metadata.nodeId;
      const admission = verified.admission;
      const registration = yield* Effect.tryPromise({
        try: () =>
          attempt.wait(
            serviceNodeNetwork(this.request, admission).register(
              before.metadata.nodeId,
              false,
              verified.developmentHistory?.id,
            ),
          ),
        catch: connectionFailure,
      });
      if (registration === 'missing') {
        return yield* makeZerospinError('node-producer-not-registered');
      }
      const ticket = yield* serviceNodeNetwork(
        this.request,
        admission,
      ).ticketProgram();
      if (!attempt.active()) return;
      yield* Effect.tryPromise({
        try: () => this.openSocket(attempt, before, ticket.ticket),
        catch: connectionFailure,
      });
    });
  }

  private scheduleRetry() {
    if (!this.stopped && this.retry === null) {
      this.retry = setTimeout(() => {
        this.retry = null;
        void this.resume().catch(() => undefined);
      }, 3000);
    }
  }

  private async openSocket(
    attempt: ReturnType<typeof makeSocketAttempt>,
    before: Awaited<ReturnType<ServiceNode['snapshot']>>,
    ticket: string,
  ) {
    const checkpoint = before.metadata;
    if (!hasServiceNodeCheckpoint(checkpoint)) {
      throw makeZerospinError('node-execution-checkpoint-invalid');
    }
    const generation = this.generation;
    const url = new URL(this.request.apiUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws-service-session-commands`;
    url.search = '';
    const endpoint = `${url.origin}${url.pathname}`;
    url.searchParams.set('ticket', ticket);
    const socket = new WebSocket(url);
    this.socket = socket;
    attempt.own(() => {
      if (this.socket === socket) this.socket = null;
      socket.close();
    });
    const listen = <K extends keyof WebSocketEventMap>(
      kind: K,
      listener: (event: WebSocketEventMap[K]) => void,
    ) => {
      socket.addEventListener(kind, listener);
      attempt.own(() => socket.removeEventListener(kind, listener));
    };
    const retainCommand = async (
      command: Parameters<ServiceNode['receiveCommand']>[0],
    ) => {
      if (!attempt.active()) return;
      await attempt.wait(this.node.receiveCommand(command));
      if (
        generation !== this.generation ||
        this.socket !== socket ||
        this.stopped
      ) {
        return;
      }
      const pending = this.pending;
      if (pending !== null && pending.command.id === command.id) {
        this.pending = null;
        pending.resolve();
      }
    };
    await new Promise<void>((resolve, reject) => {
      let opened = false;
      let live = false;
      let failed = false;
      const fail = (error: unknown) => {
        if (failed || !attempt.active()) return;
        failed = true;
        clearTimeout(timeout);
        socket.close();
        this.pending?.reject(
          makeZerospinError({ code: 'node-admission-uncertain' }),
        );
        this.pending = null;
        reject(error);
        // A live socket has already resolved its startup promise; notify the outer owner too.
        if (live) {
          void (async () => {
            await attempt.stop();
            if (this.stopped || generation !== this.generation) return;
            try {
              if (
                shouldResetConnectedNode({
                  failure: error,
                  attempted: false,
                }) &&
                (await this.recover?.(error, before.metadata.nodeId))
              ) {
                return;
              }
            } catch (recoveryFailure) {
              error = recoveryFailure;
            }
            this.node.connectionState('blocked', error);
          })().catch(failure => this.node.connectionState('blocked', failure));
        }
      };
      const timeout = setTimeout(() => {
        fail(makeZerospinError({ code: 'node-subscription-timeout' }));
      }, 15000);
      attempt.own(() => {
        clearTimeout(timeout);
        reject(makeZerospinError('node-authentication-cancelled'));
      });
      listen('open', () => {
        if (!attempt.active()) return;
        opened = true;
        socket.send(
          JSON.stringify({
            type: 'resume',
            nodeId: before.metadata.nodeId,
            outcomeIndex: before.outcomeIndex,
            serviceIndex: checkpoint.serviceIndex,
            dispositionChainHash: checkpoint.dispositionChainHash,
          }),
        );
      });
      listen('message', event => {
        void attempt
          .enqueue(async () => {
            if (
              failed ||
              generation !== this.generation ||
              this.socket !== socket ||
              this.stopped
            ) {
              return;
            }
            try {
              const message = Schema.decodeUnknownSync(
                Schema.fromJsonString(ServiceSocketServerMessageSchema),
              )(event.data, { onExcessProperty: 'error' });
              if (message.type === 'commands') {
                for (const command of message.commands) {
                  await retainCommand(command);
                }
                return;
              }
              if (message.type === 'state-required') {
                if (message.reason === 'node-producer-not-registered') {
                  const verified = await attempt.wait(
                    this.authentication.authenticate(),
                  );
                  const registration = await attempt.wait(
                    serviceNodeNetwork(
                      this.request,
                      verified.admission,
                    ).register(
                      before.metadata.nodeId,
                      false,
                      verified.developmentHistory?.id,
                    ),
                  );
                  if (registration === 'missing') {
                    throw makeZerospinError('node-producer-not-registered');
                  }
                }
                const { type: _type, ...details } = message;
                throw makeZerospinError({
                  code:
                    message.reason === 'checkpoint-conflict'
                      ? 'node-checkpoint-conflict'
                      : 'node-state-required',
                  ...(message.reason === 'checkpoint-conflict'
                    ? {}
                    : {
                        message:
                          message.reason === 'node-identity-mismatch'
                            ? 'The socket ticket belongs to a different node identity.'
                            : message.reason === 'connection-state-invalid'
                              ? 'The server no longer has the admitted connection state for this node.'
                              : 'The server failed while resuming this node. See the backend diagnostics.',
                      }),
                  extra: details,
                });
              }
              if (message.type === 'serviceCommandAdmissionFailed') {
                const receipt = message;
                const pending = this.pending;
                if (pending === null || receipt.id !== pending.command.id) {
                  throw makeZerospinError({
                    code: 'node-admission-reply-mismatch',
                  });
                }
                if (isNodeAdmissionBackpressure(receipt.failure)) {
                  throw makeZerospinError({ code: 'node-admission-uncertain' });
                }
                if (receipt.failure.code === 'node-producer-not-registered') {
                  const verified = await attempt.wait(
                    this.authentication.authenticate(),
                  );
                  const registration = await attempt.wait(
                    serviceNodeNetwork(
                      this.request,
                      verified.admission,
                    ).register(
                      before.metadata.nodeId,
                      false,
                      verified.developmentHistory?.id,
                    ),
                  );
                  if (registration === 'missing') {
                    throw makeZerospinError('node-producer-not-registered');
                  }
                }
                const mismatch = Schema.decodeUnknownOption(
                  Schema.Struct({
                    code: Schema.Literal('node-admission-index-mismatch'),
                    extra: Schema.Struct({ expectedPushIndex: Schema.Number }),
                  }),
                )(receipt.failure);
                if (
                  mismatch._tag === 'Some' &&
                  mismatch.value.extra.expectedPushIndex >
                    pending.command.pushIndex
                ) {
                  await attempt.wait(
                    this.node.reconcileAdmission(
                      mismatch.value.extra.expectedPushIndex,
                      () =>
                        generation === this.generation &&
                        this.socket === socket &&
                        !this.stopped,
                    ),
                  );
                  if (
                    generation !== this.generation ||
                    this.socket !== socket ||
                    this.stopped
                  ) {
                    return;
                  }
                  this.pending = null;
                  pending.resolve();
                } else {
                  this.node.admissionRejected({
                    commandId: pending.command.id,
                    commandName: pending.command.commandName,
                    failure: receipt.failure,
                  });
                  this.pending = null;
                  pending.reject(receipt.failure);
                  throw makeZerospinError({ code: 'node-admission-rejected' });
                }
              } else if (message.type === 'serviceCommandAdmission') {
                const receipt = message;
                const pending = this.pending;
                const prefix = (
                  await attempt.wait(
                    this.node.snapshot({ authoritative: true }),
                  )
                ).metadata.admittedThroughPushIndex;
                if (
                  generation !== this.generation ||
                  this.socket !== socket ||
                  this.stopped
                ) {
                  return;
                }
                if (
                  receipt.pushIndex > prefix &&
                  (pending === null ||
                    receipt.id !== pending.command.id ||
                    receipt.pushIndex !== pending.command.pushIndex)
                ) {
                  throw makeZerospinError({
                    code: 'node-admission-reply-mismatch',
                  });
                }
                await attempt.wait(
                  this.node.admitted(
                    receipt,
                    () =>
                      generation === this.generation &&
                      this.socket === socket &&
                      !this.stopped,
                  ),
                );
                if (
                  generation !== this.generation ||
                  this.socket !== socket ||
                  this.stopped
                ) {
                  return;
                }
                if (
                  pending !== null &&
                  receipt.id === pending.command.id &&
                  receipt.pushIndex === pending.command.pushIndex
                ) {
                  this.pending = null;
                  pending.resolve();
                }
              } else if (message.type === 'replay-complete') {
                const snapshot = await attempt.wait(
                  this.node.snapshot({ authoritative: true }),
                );
                if (!attempt.active()) return;
                if (
                  !hasServiceNodeCheckpoint(snapshot.metadata) ||
                  snapshot.metadata.serviceIndex !== message.serviceIndex ||
                  snapshot.metadata.dispositionChainHash !==
                    message.dispositionChainHash ||
                  snapshot.outcomeIndex !== message.outcomeIndex
                ) {
                  throw makeZerospinError({ code: 'node-replay-incomplete' });
                }
                clearTimeout(timeout);
                live = true;
                this.node.connectionState('online');
                resolve();
                void this.push().catch(() => undefined);
              } else {
                throw makeZerospinError({
                  code: 'node-subscription-message-invalid',
                });
              }
            } catch (error) {
              fail(error);
            }
          })
          .catch(fail);
      });
      listen('error', () => socket.close());
      listen('close', event => {
        // Earlier frames determine the protocol failure before transport closure.
        void attempt
          .enqueue(async () => {
            if (failed || this.stopped) return;
            failed = true;
            clearTimeout(timeout);
            if (this.socket === socket) this.socket = null;
            this.pending?.reject(
              makeZerospinError({ code: 'node-admission-uncertain' }),
            );
            this.pending = null;
            const error = makeZerospinError({
              code: 'node-subscription-closed',
              extra: {
                endpoint,
                phase: live ? 'live' : opened ? 'replaying' : 'connecting',
                closeCode: event.code,
                closeReason: event.reason,
                wasClean: event.wasClean,
              },
            });
            if (!live) {
              reject(error);
              return;
            }
            // A local CLI restart can close a live socket while the browser itself is online.
            if (isBrowserOffline() || this.verifiedLocalHistory) {
              this.node.connectionState('offline', error);
              this.scheduleRetry();
            } else {
              this.node.connectionState('blocked', error);
            }
          })
          .catch(fail);
      });
    });
  }

  push(manual = false): Promise<{ status: 'empty' | 'pushed' }> {
    return BrowserRpc.run(this.pushProgram(manual));
  }

  pushProgram(
    manual = false,
  ): Effect.Effect<{ status: 'empty' | 'pushed' }, IPushError> {
    return Effect.suspend(() => {
      if (this.pushing !== null) {
        const pushing = this.pushing;
        return Effect.promise(() => pushing).pipe(
          Effect.flatMap(exit =>
            Exit.isFailure(exit)
              ? Effect.failCause(exit.cause)
              : Effect.succeed(exit.value),
          ),
        );
      }
      const program = this.resumeProgram().pipe(
        Effect.flatMap(() =>
          Effect.tryPromise({
            try: async signal => {
              for (;;) {
                if (this.stopped) throw makeZerospinError('node-signed-out');
                if (isBrowserOffline()) throw makeZerospinError('node-offline');
                const command = await awaitConnectionStep(
                  this.node.nextPush(manual),
                  signal,
                );
                if (command === null) {
                  return { status: 'empty' as const };
                }
                if (this.stopped) throw makeZerospinError('node-signed-out');
                const socket = this.socket;
                if (socket?.readyState !== WebSocket.OPEN) {
                  throw makeZerospinError({ code: 'node-offline' });
                }
                const {
                  id,
                  nodeId,
                  pushIndex,
                  commandName,
                  payload,
                  contractVersion,
                  actorName,
                  actorVersion,
                  sessionName,
                  claims,
                } = command;
                await new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(() => {
                    socket.close();
                    reject(
                      makeZerospinError({ code: 'node-admission-uncertain' }),
                    );
                  }, 15000);
                  this.pending = {
                    command,
                    resolve: () => {
                      clearTimeout(timeout);
                      resolve();
                    },
                    reject: error => {
                      clearTimeout(timeout);
                      reject(error);
                    },
                  };
                  socket.send(
                    JSON.stringify({
                      type: 'pushServiceCommand',
                      command: {
                        id,
                        commandName,
                        payload,
                        contractVersion,
                        serviceName: command.serviceName,
                        serviceVersion: this.request.serviceVersion,
                        kind: 'actor',
                        actorName,
                        actorVersion,
                        claims,
                        sessionName,
                        nodeId,
                        pushIndex,
                      },
                    }),
                  );
                });
                if (manual) {
                  return { status: 'pushed' as const };
                }
              }
            },
            catch: pushFailure,
          }),
        ),
      );
      const controller = new AbortController();
      this.pushController = controller;
      const pushing = Effect.runPromiseExit(program, {
        signal: controller.signal,
      });
      this.pushing = pushing;
      void pushing
        .finally(() => {
          if (this.pushing === pushing) {
            this.pushing = null;
            if (this.pushController === controller) this.pushController = null;
          }
        })
        .catch(() => undefined);
      return Effect.promise(() => pushing).pipe(
        Effect.flatMap(exit =>
          Exit.isFailure(exit)
            ? Effect.failCause(exit.cause)
            : Effect.succeed(exit.value),
        ),
      );
    });
  }

  stop(): Promise<void> {
    if (this.stopping !== null) return this.stopping;
    this.stopped = true;
    this.generation += 1;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    this.authentication.clear();
    this.pushController?.abort();
    this.pushController = null;
    this.pending?.reject(makeZerospinError('node-signed-out'));
    this.pending = null;
    const attempt = this.attempt;
    this.attempt = null;
    const retired = attempt?.stop();
    const connecting = this.connecting;
    const pushing = this.pushing;
    const stopping = (async (): Promise<void> => {
      let failure: unknown;
      let failed = false;
      try {
        await retired;
      } catch (error) {
        failed = true;
        failure = error;
      }
      await connecting;
      await pushing;
      this.connecting = null;
      this.pushing = null;
      this.socket = null;
      if (failed) return Promise.reject(failure);
    })();
    this.stopping = stopping;
    return stopping;
  }
}
