import { receiveCommandRows } from '@zerospin/browser/AggregateNode/receiveCommandRows';
import { makeSessionLifecycle } from '@zerospin/browser/makeSessionLifecycle';
import { makeNodeCommandInterests } from '@zerospin/browser/Node/makeNodeCommandInterests';
import { makeSessionFailureObserver } from '@zerospin/browser/Node/makeSessionFailureObserver';
import { retainOriginatingCommand } from '@zerospin/browser/Node/retainOriginatingCommand';
import { makeOutboxSubscriber } from '@zerospin/browser/outbox/makeOutboxSubscriber';
import { makeSessionCommandHandoff } from '@zerospin/browser/outbox/makeSessionCommandHandoff';
import {
  makeAggregateReplicaReceiver,
  type IAggregateReplicaReceiver,
} from '@zerospin/browser/sessionReplica/makeAggregateReplicaReceiver';
import { AggregateNodeCommandSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { decodeRetainedAggregateSessionCommand } from '@zerospin/core/aggregateSession/decodeRetainedAggregateSessionCommand';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { stageAggregateSessionCommand } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand';
import type { IAnyAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import { resolveSessionFailure } from '@zerospin/core/contracts/failureCodec';
import { makeResourceFromEncodedRow } from '@zerospin/core/Node/resourceEnvelope';
import { sessionSubmissionKey } from '@zerospin/core/Node/sessionSubmissionKey';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import {
  decodeAggregateNativeSessionInputs,
  type IAggregateNativeConfiguration,
} from './decodeAggregateNativeSessionInputs.ts';
import { openAggregateNativeNodeOwner } from './openAggregateNativeNodeOwner.ts';
import { openPersistentAggregateReplica } from './openPersistentAggregateReplica.ts';

/** One session lifetime owns both files, transport and handoff; Swift owns the directory lease. */
export async function makeNativeSession(props: {
  sessionDefinition: IAnyAggregateSessionDefinition;
  configuration: IAggregateNativeConfiguration;
  changed(): void;
  signal?: AbortSignal;
}) {
  const { configuration, claims, request } =
    decodeAggregateNativeSessionInputs(props);
  const changed = props.changed.bind(props);
  const { sessionDefinition, signal: sessionAbortSignal } = props;
  let disposed = false;
  let suspended = false;
  let disposal: Promise<void> | undefined;
  let runtime: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
  const session = makeAggregateSession({
    sessionDefinition,
    onTerminalFailure: () => runtime.retire(),
    execution: {
      runSync: program => runtime.runSync(program),
      runPromise: (program, options) => runtime.runPromise(program, options),
    },
  });
  runtime = makeSessionLifecycle<unknown, never>({
    layer: undefined,
    reportFailure: session.reportFailure,
    store: session.store,
    telemetryCollector: session.store.getState().telemetryCollector,
    infrastructure: Layer.empty,
    onDispose: () => session.release(),
  });
  const dispose = (): Promise<void> => {
    if (disposal !== undefined) return disposal;
    disposed = true;
    suspended = true;
    disposal = runtime.dispose();
    return disposal;
  };
  const abort = () => {
    void dispose().catch(() => undefined);
  };
  sessionAbortSignal?.addEventListener('abort', abort, { once: true });
  if (sessionAbortSignal?.aborted) abort();
  const assertNotFailed = () => {
    const state = session.store.getState();
    if (state.status === 'failed') throw state.failure;
  };
  let controls:
    | {
        snapshot(): unknown;
        stage(contractName: string, payload: unknown): unknown;
        resume(): Promise<void>;
        suspend(): Promise<void>;
        pushNow(): Promise<{ status: 'empty' | 'pushed' }>;
        clearAuthentication(): Promise<void>;
      }
    | undefined;
  try {
    if (disposed) throw makeZerospinError('native-session-disposed');
    await runtime.initialize(({ execution, signal }) =>
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() =>
            sessionAbortSignal?.removeEventListener('abort', abort),
          ),
        );
        const owner = yield* openAggregateNativeNodeOwner({
          request,
          sessionDefinition,
          claims,
          configuration,
          signal,
        });
        const replica = yield* openPersistentAggregateReplica({
          sessionDefinition,
          claims,
          owner,
          signal,
        });
        const { node, authentication, synchronization } = owner;
        const active = () => !disposed && !suspended && !signal.aborted;
        const checkActive = () => {
          if (!active()) throw makeZerospinError('node-tab-detached');
        };
        const originatingCommands = new Map<string, string>();
        const observer = makeSessionFailureObserver({
          isCurrent: active,
          originatingCommands,
          reportFailure: session.reportFailure,
          recognizeFailure: (commandName, failure) =>
            execution.runSync(
              resolveSessionFailure(sessionDefinition, commandName, failure),
            ),
        });
        let receiver: IAggregateReplicaReceiver<IAnyAggregateSessionDefinition>;
        const interests = makeNodeCommandInterests<IAggregateNodeCommand>();
        const prepareCommand = (
          row: typeof replica.dbConfig.schema.commands.$inferSelect,
        ) =>
          decodeRetainedAggregateSessionCommand(row, {
            definition: sessionDefinition,
            identity: owner.definition.identity,
            sessionId: replica.sessionId,
          });
        const recoveryRequests = () =>
          replica
            .readPending()
            .map(row => execution.runSync(prepareCommand(row)));
        const handoff = yield* makeSessionCommandHandoff<
          typeof replica.dbConfig.schema.commands.$inferSelect,
          IAggregateNodeCommand,
          unknown
        >({
          reportFailure: session.reportFailure,
          readPending: () => replica.readPending(true),
          prepare: prepareCommand,
          attachment: () => {
            const state = session.store.getState();
            const expectedNodeId = state.nodeState?.nodeId;
            if (
              !active() ||
              node.status().blockedWork ||
              state.initialized === null ||
              expectedNodeId === undefined
            ) {
              return null;
            }
            return {
              isCurrent: () =>
                active() &&
                session.store.getState().nodeState?.nodeId === expectedNodeId,
              subscriber: async () =>
                makeOutboxSubscriber({
                  schema: Schema.toType(AggregateNodeCommandSchema),
                  check: checkActive,
                  receive: async rows => {
                    interests.add(rows);
                    const receipts = await receiveCommandRows({
                      rows,
                      expectedNodeId,
                      node,
                      check: checkActive,
                      synchronization,
                    });
                    interests.retained(receipts);
                    return receipts;
                  },
                }),
            };
          },
          retainCoordinates: receipt => receiver.retainCoordinates(receipt),
          isActive: () => {
            const state = session.store.getState();
            return (
              active() &&
              state.initialized !== null &&
              state.nodeState?.blockedWork !== true &&
              state.nodeState?.authentication !== 'signed-out'
            );
          },
          context: execution.runSync(Effect.context<unknown>()),
          // Staging and reconstruction own eligibility; resuming delivery cannot rearm it.
          originating: () => {},
          changed: () => {},
        });
        receiver = yield* makeAggregateReplicaReceiver({
          session,
          sessionId: replica.sessionId,
          replica,
          execution,
          stagedCommandOutbox: handoff,
          originatingCommands,
          observer,
          current: active,
          expectedClaims: claims,
        });
        const publish = () => {
          if (!active()) return;
          try {
            changed();
          } catch (error) {
            console.error('Cannot publish native session snapshot', error);
          }
        };
        yield* Effect.acquireRelease(
          Effect.sync(() => session.store.subscribe(publish)),
          unsubscribe => Effect.sync(unsubscribe),
        );
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            replica.client.subscribeToTableChanges(() => {
              if (active()) {
                handoff.observe();
                publish();
              }
            }),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        );
        // The final fence is newer than the replica client: accepted Node deliveries drain first.
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            const stopped = yield* Effect.exit(
              Effect.promise(() => synchronization.stop()),
            );
            const handedOff = yield* Effect.exit(handoff.dispose);
            const closed = yield* Effect.exit(
              Effect.promise(() => node.close()),
            );
            for (const exit of [stopped, handedOff, closed]) {
              if (Exit.isFailure(exit)) {
                return yield* Effect.failCause(exit.cause);
              }
            }
          }),
        );
        const initializeProjection = async () => {
          await receiver.view(
            await node.snapshot({
              pendingCommands: recoveryRequests(),
            }),
          );
          handoff.observe();
        };
        for (const row of replica.readPending()) {
          originatingCommands.set(
            sessionSubmissionKey({
              sessionId: replica.sessionId,
              sessionIndex: row.sessionIndex,
            }),
            row.commandName,
          );
          retainOriginatingCommand(originatingCommands, {
            sessionId: replica.sessionId,
            sessionIndex: row.sessionIndex,
            nodeId: row.nodeId,
            pushIndex: row.pushIndex,
          });
        }
        interests.add(recoveryRequests());
        yield* Effect.promise(initializeProjection);
        yield* Effect.acquireRelease(
          Effect.promise(() =>
            node.subscribe(
              {},
              {
                view: async snapshot => {
                  await receiver.view(snapshot);
                  interests.acknowledge(snapshot.commandCoverage);
                },
                reset: async () => {
                  interests.clear();
                  await receiver.reset();
                },
                state: async state => receiver.state(state),
              },
              interests.read,
            ),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        );
        yield* Effect.acquireRelease(
          Effect.sync(() =>
            session.store.subscribe((state, previous) => {
              if (
                state.failure === previous.failure &&
                state.status === previous.status
              ) {
                return;
              }
              changed();
            }),
          ),
          unsubscribe => Effect.sync(unsubscribe),
        );
        controls = {
          snapshot: () =>
            disposed || session.store.getState().status === 'failed'
              ? {
                  initialized: false,
                  resources: {},
                  node: null,
                  failure:
                    session.store.getState().failure === null
                      ? null
                      : prettyUnknownFailure(session.store.getState().failure),
                }
              : {
                  initialized:
                    active() && session.store.getState().initialized !== null,
                  resources: mapValues(sessionDefinition.models, model =>
                    replica.db
                      .select()
                      .from(model.drizzleSchema)
                      .all()
                      .map(row => makeResourceFromEncodedRow(row, model)),
                  ),
                  node: {
                    ...session.store.getState().nodeState,
                    ...node.status(),
                    uncertainHandoffs: replica.readPending(true).length,
                  },
                  failure:
                    session.store.getState().failure?.message ??
                    node.status().failure?.message ??
                    null,
                },
          stage(contractName, payload) {
            assertNotFailed();
            if (!active() || session.store.getState().initialized === null) {
              throw makeZerospinError('native-session-unavailable');
            }
            const result = stageAggregateSessionCommand({
              session,
              contractName,
              payload: Schema.decodeUnknownSync(
                Schema.Record(Schema.String, Schema.Unknown),
              )(payload),
            });
            if (result._tag === 'Success') {
              originatingCommands.set(
                sessionSubmissionKey(result.success),
                contractName,
              );
              handoff.observe();
            }
            publish();
            return result._tag === 'Failure'
              ? result
              : {
                  _tag: 'Success',
                  success: {
                    sessionId: result.success.sessionId,
                    sessionIndex: result.success.sessionIndex,
                  },
                };
          },
          async resume() {
            assertNotFailed();
            if (disposed) throw makeZerospinError('native-session-disposed');
            await authentication.resume(owner.definition.identity);
            await synchronization.enable();
            suspended = false;
            await initializeProjection();
            await synchronization.resume();
          },
          async suspend() {
            assertNotFailed();
            suspended = true;
            handoff.reset();
            await synchronization.stop();
          },
          async pushNow() {
            assertNotFailed();
            if (!active()) {
              throw makeZerospinError('native-session-unavailable');
            }
            handoff.observe();
            for (const row of replica.readPending(true)) {
              await handoff.waitForRetention(row.sessionIndex);
            }
            return synchronization.push(true);
          },
          async clearAuthentication() {
            assertNotFailed();
            suspended = true;
            try {
              session.store.setState({
                status: 'initializing',
                initialized: null,
              });
            } catch (error) {
              console.error('Cannot withhold native session capability', error);
            }
            handoff.reset();
            authentication.clear();
            await synchronization.stop();
            await node.clearAuthentication();
          },
        };
        handoff.observe();
        yield* Effect.promise(() =>
          synchronization.resume().catch(() => undefined),
        );
      }),
    );
    if (controls === undefined || disposed) {
      throw makeZerospinError('native-session-disposed');
    }
    return { ...controls, dispose };
  } catch (error) {
    sessionAbortSignal?.removeEventListener('abort', abort);
    try {
      await dispose();
    } catch (cleanupError) {
      console.error('Cannot complete native startup cleanup', cleanupError);
    }
    throw error;
  }
}
