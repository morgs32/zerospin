import { makeSessionLifecycle } from '@zerospin/browser/makeSessionLifecycle';
import type { IAggregateNodeSnapshot } from '@zerospin/core/AggregateNode/AggregateNode';
import type { AggregateNodeCommandCoverageSchema } from '@zerospin/core/AggregateNode/AggregateNodeCommandSchema';
import type { IAggregateNodeCommand } from '@zerospin/core/AggregateNode/types';
import { decodeRetainedAggregateSessionCommand } from '@zerospin/core/aggregateSession/decodeRetainedAggregateSessionCommand';
import { installAggregateNodeView } from '@zerospin/core/aggregateSession/installAggregateNodeView';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import { stageAggregateSessionCommand } from '@zerospin/core/aggregateSession/stageCommand/stageAggregateSessionCommand';
import type { IAnyAggregateSessionDefinition } from '@zerospin/core/aggregateSession/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { drainStandaloneCommands } from '@zerospin/core/StandaloneNode/drainStandaloneCommands';
import { makeZerospinError, type PublicFailureSchema } from '@zerospin/error';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { openNativeStandaloneNodeOwner } from './openNativeStandaloneNodeOwner.ts';
import { openPersistentAggregateReplica } from './openPersistentAggregateReplica.ts';

const configurationSchema = Schema.Struct({
  aggregateId: Schema.NonEmptyString,
});

type IResolution = NonNullable<
  (typeof AggregateNodeCommandCoverageSchema.Type)['resolution']
>;
type ISnapshot = Readonly<{
  resources: Readonly<Record<string, readonly IEncodedResourceShape[]>>;
  observedAtMs: number;
}>;
type IResult =
  | Readonly<{ _tag: 'Success'; resolution: IResolution }>
  | Readonly<{
      _tag: 'Failure';
      failure: typeof PublicFailureSchema.Type;
      resolution: IResolution | null;
    }>;
type INativeStandaloneSession = Readonly<{
  snapshot(): Promise<ISnapshot>;
  submit(
    commandName: string,
    payload: unknown,
  ): Promise<{
    result: IResult;
    snapshot: ISnapshot;
  }>;
  dispose(): Promise<void>;
}>;

/** Settle the persistent staging journal before publishing only committed model rows. */
export async function makeNativeStandaloneSession(props: {
  sessionDefinition: IAnyAggregateSessionDefinition;
  configuration: typeof configurationSchema.Type;
  signal?: AbortSignal;
}): Promise<INativeStandaloneSession> {
  const { sessionDefinition, signal: hostSignal } = props;
  if (sessionDefinition.systemName !== 'standalone') {
    throw makeZerospinError('native-session-identity-mismatch');
  }
  const { aggregateId } = Schema.decodeUnknownSync(configurationSchema)(
    props.configuration,
    { onExcessProperty: 'error' },
  );
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
    infrastructure: Layer.empty,
    reportFailure: session.reportFailure,
    store: session.store,
    telemetryCollector: session.store.getState().telemetryCollector,
    onDispose: () => session.release(),
  });
  let serial: Promise<unknown> = Promise.resolve();
  let disposal: Promise<void> | undefined;
  const enqueue = <A>(work: () => Promise<A>): Promise<A> => {
    if (disposal !== undefined) {
      return Promise.reject(makeZerospinError('native-session-disposed'));
    }
    const next = serial.then(work);
    serial = next.catch(() => undefined);
    return next;
  };
  const dispose = () => {
    if (disposal !== undefined) return disposal;
    hostSignal?.removeEventListener('abort', abort);
    disposal = serial.then(() => runtime.dispose());
    return disposal;
  };
  const abort = () => {
    void dispose().catch(() => undefined);
  };
  hostSignal?.addEventListener('abort', abort, { once: true });
  if (hostSignal?.aborted) abort();

  let controls: Omit<INativeStandaloneSession, 'dispose'> | undefined;
  try {
    if (disposal !== undefined) {
      throw makeZerospinError('native-session-disposed');
    }
    await runtime.initialize(({ execution, signal }) =>
      Effect.gen(function* () {
        const owner = yield* openNativeStandaloneNodeOwner({
          sessionDefinition,
          aggregateId,
        });
        const { node, nodeId, definition, claims, db, readDb } = owner;
        const replica = yield* openPersistentAggregateReplica({
          sessionDefinition,
          claims,
          owner,
          signal,
        });
        const settlePending = Effect.fn('nativeStandalone.settlePending')(
          function* () {
            const pending: IAggregateNodeCommand[] = [];
            for (const row of replica.readPending()) {
              const command = yield* decodeRetainedAggregateSessionCommand(
                row,
                {
                  definition: sessionDefinition,
                  identity: definition.identity,
                  sessionId: replica.sessionId,
                },
              );
              yield* Effect.promise(() => node.accept(command, nodeId));
              pending.push(command);
            }
            yield* drainStandaloneCommands({
              node,
              sessionDefinition,
              db,
              readDb,
              aggregateId,
              expectedNodeId: nodeId,
            });
            const captured = yield* Effect.promise(() =>
              node.snapshot({
                authoritative: true,
                pendingCommands: pending,
              }),
            );
            if (
              captured.commandCoverage.some(
                coverage => coverage.resolution === null,
              )
            ) {
              return yield* makeZerospinError('node-command-final-missing');
            }
            const installed = yield* installAggregateNodeView({
              db: replica.db,
              definition: sessionDefinition,
              sessionId: replica.sessionId,
              snapshot: captured,
            });
            return { captured, installed };
          },
        );
        const initial = yield* settlePending();
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition,
          db: replica.db,
          admitted: {
            sessionId: replica.sessionId,
            aggregateId,
            actorName: sessionDefinition.actorName,
            actorVersion: sessionDefinition.actorVersion,
            claims,
          },
        });
        session.store.setState({
          status: 'ready',
          initialized,
          aggregateIndex: initial.installed.aggregateIndex,
          dispositionChainHash: initial.installed.dispositionChainHash,
          pushIndex: initial.captured.pushIndex,
        });

        const present = (captured: IAggregateNodeSnapshot) =>
          Effect.map(Clock.currentTimeMillis, observedAtMs => ({
            resources: mapValues(sessionDefinition.models, (_model, name) =>
              captured.resources.filter(row => row.modelName === name),
            ),
            observedAtMs,
          }));
        const snapshot = () =>
          execution.runPromise(
            Effect.gen(function* () {
              const { captured } = yield* settlePending();
              return yield* present(captured);
            }),
          );
        controls = {
          snapshot: () => enqueue(snapshot),
          submit: (commandName, payload) =>
            enqueue(async () => {
              if (replica.readPending().length > 0) await snapshot();
              const staged = stageAggregateSessionCommand({
                session,
                contractName: commandName,
                payload: Schema.decodeUnknownSync(
                  Schema.Record(Schema.String, Schema.Unknown),
                )(payload),
              });
              if (staged._tag === 'Failure') {
                return {
                  result: {
                    _tag: 'Failure',
                    failure: staged.failure.toJson(),
                    resolution: null,
                  },
                  snapshot: await snapshot(),
                };
              }
              return execution.runPromise(
                Effect.gen(function* () {
                  const { captured } = yield* settlePending();
                  const resolution = captured.commandCoverage.find(
                    coverage =>
                      coverage.sessionId === staged.success.sessionId &&
                      coverage.sessionIndex === staged.success.sessionIndex,
                  )?.resolution;
                  if (resolution == null) {
                    return yield* makeZerospinError(
                      'node-command-final-missing',
                    );
                  }
                  return {
                    result:
                      resolution.failure === null
                        ? { _tag: 'Success', resolution }
                        : {
                            _tag: 'Failure',
                            failure: resolution.failure,
                            resolution,
                          },
                    snapshot: yield* present(captured),
                  };
                }),
              );
            }),
        };
      }),
    );
    if (controls === undefined || disposal !== undefined) {
      throw makeZerospinError('native-session-disposed');
    }
    return { ...controls, dispose };
  } catch (failure) {
    await dispose().catch(() => undefined);
    throw failure;
  }
}
