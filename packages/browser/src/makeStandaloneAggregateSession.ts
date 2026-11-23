import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import type { IAggregateSessionReplayRequirements } from '@zerospin/core/sessionExecution/requirements';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { applicationLayer as getApplicationLayer } from './browserSession/applicationLayer.ts';
import { decodeStandaloneInputs } from './browserSession/decodeSessionInputs.ts';
import type { IStandaloneSessionInitialization } from './browserSession/types.ts';
import { makeSessionLifecycle } from './makeSessionLifecycle.ts';
import { openAggregateSessionReplica } from './sessionReplica/openAggregateSessionReplica.ts';
import type { ISessionRuntimeServices } from './sessionRuntime.ts';
import { makeStandaloneAggregateConnection } from './StandaloneNode/makeStandaloneAggregateConnection.ts';
import {
  encodeStandaloneClaims,
  standalonePath,
  standaloneStorageKey,
} from './StandaloneNode/standaloneIdentity.ts';
const STANDALONE_SYSTEM_NAME = 'standalone';

export type IStandaloneAggregateSessionInputs<
  D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
  P extends string = string,
> = {
  sharedWorkerUrl: string;
  discardUnrestorable?: boolean;
  layer?: L;
} & ([
  Exclude<
    IAggregateSessionReplayRequirements<NoInfer<D>>,
    ISessionRuntimeServices
  >,
] extends [never]
  ? unknown
  : {
      layer: Layer.Layer<
        Exclude<
          IAggregateSessionReplayRequirements<NoInfer<D>>,
          ISessionRuntimeServices
        >,
        IAnyError,
        never
      >;
    }) &
  IStandaloneSessionInitialization<D['claimsSchema'], D['models'], P>;

/** Construct a cold persistent local aggregate without backend transport. */
export function makeStandaloneAggregateSession<
  const D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
  const P extends string = string,
>(
  props: { definition: D } & IStandaloneAggregateSessionInputs<D, L, P>,
): IAggregateSession<D, ISessionRuntimeServices | Layer.Success<L>> & {
  readonly systemName: D['systemName'];
  readonly claimsSchema: D['claimsSchema'];
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  reset(): Promise<void>;
} {
  const {
    definition,
    layer: suppliedLayer,
    sharedWorkerUrl,
    discardUnrestorable = false,
    claims: initialClaims,
    backupPath,
    resources: initialResources,
  } = props;
  if (
    definition.systemName !== STANDALONE_SYSTEM_NAME ||
    !Schema.is(Schema.NonEmptyString)(sharedWorkerUrl)
  ) {
    throw makeZerospinError('standalone-shared-worker-required');
  }
  const layer = getApplicationLayer(suppliedLayer);
  const boundInitialization = decodeStandaloneInputs(definition, {
    claims: initialClaims,
    backupPath,
    ...(initialResources === undefined ? {} : { resources: initialResources }),
  });
  let lifecycle: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
  const session = makeAggregateSession<D, unknown>({
    sessionDefinition: definition,
    onTerminalFailure: () => lifecycle.retire(),
    execution: {
      runSync: program => lifecycle.runSync(program),
      runPromise: (program, options) => lifecycle.runPromise(program, options),
    },
  });
  let captured: typeof boundInitialization | undefined;
  let resetting: Promise<void> | undefined;
  let epoch = 0;
  lifecycle = makeSessionLifecycle<unknown, never>({
    layer,
    reportFailure: session.reportFailure,
    store: session.store,
    infrastructure: Layer.empty,
    telemetryCollector: session.store.getState().telemetryCollector,
    onDispose: () => {
      if (session.sessionId !== null) {
        zerospinDevtoolsStore
          .getState()
          .removeAggregateSession(session.sessionId);
      }
      session.release();
    },
  });
  const start = (
    initialization: NonNullable<typeof captured>,
    reset: boolean,
  ) =>
    lifecycle.initialize(({ execution, signal }) =>
      Effect.gen(function* () {
        const { claims, encoded } = encodeStandaloneClaims(
          definition,
          initialization.claims,
        );
        const path = standalonePath(initialization.backupPath, claims);
        const key = yield* Effect.promise(() =>
          standaloneStorageKey(definition, path),
        );
        const models = definition.models;
        const resources: IEncodedResourceShape[] = [];
        mapValues(initialization.resources ?? {}, (rows, name) => {
          const model = models[name];
          if (model === undefined) {
            throw makeZerospinError('standalone-resource-model-invalid');
          }
          for (const row of rows ?? []) {
            resources.push(Schema.encodeSync(model.resourceJsonCodec)(row));
          }
        });
        const attachment = {
          sessionName: definition.sessionName,
          pattern: initialization.backupPath.source,
          path,
          claims: encoded,
          resources,
          ...(reset ? { reset: true } : {}),
          discardUnrestorable: Schema.decodeUnknownSync(Schema.Boolean)(
            discardUnrestorable,
          ),
        };
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        const connection = makeStandaloneAggregateConnection({
          key,
          attachment,
          signal,
          sharedWorkerUrl,
          onProtocolFailure: error => {
            if (!signal.aborted) {
              session.reportFailure({ origin: 'session', error });
            }
          },
        });
        const replica = yield* openAggregateSessionReplica({
          session,
          sessionId,
          execution,
          connection,
          expectedClaims: claims,
          signal,
          reportFailure: session.reportFailure,
        });
        yield* connection.start(replica);
        if (signal.aborted) return;
        zerospinDevtoolsStore.getState().addAggregateSession({
          sessionId,
          session,
          getPushPaused: () =>
            execution.runPromise(
              connection.getPushPaused.pipe(encodeRpcOutcome),
            ),
          setPushPaused: input =>
            execution.runPromise(
              connection.setPushPaused(input).pipe(encodeRpcOutcome),
            ),
          pushNow: () =>
            execution.runPromise(connection.pushNow.pipe(encodeRpcOutcome)),
        });
      }),
    );
  const initialize = () => {
    const state = session.store.getState();
    if (state.status === 'failed') return Promise.reject(state.failure);
    const initialization = boundInitialization;
    if (resetting !== undefined) {
      throw makeZerospinError('session-already-mounted');
    }
    const copy = {
      ...initialization,
      claims: structuredClone(initialization.claims),
      ...(initialization.resources === undefined
        ? {}
        : { resources: structuredClone(initialization.resources) }),
    };
    const started = start(copy, false);
    captured = copy;
    return started;
  };
  const reset = (): Promise<void> => {
    const state = session.store.getState();
    if (state.status === 'failed') return Promise.reject(state.failure);
    if (resetting !== undefined) return resetting;
    if (captured === undefined) {
      return Promise.reject(
        makeZerospinError('standalone-initialization-required'),
      );
    }
    const initialization = captured;
    const current = ++epoch;
    resetting = (async () => {
      await lifecycle.dispose();
      if (current !== epoch) {
        throw makeZerospinError('session-initialization-canceled');
      }
      await start(initialization, true);
    })().finally(() => {
      resetting = undefined;
    });
    return resetting;
  };
  return Object.assign(session, {
    claimsSchema: definition.claimsSchema,
    systemName: definition.systemName,
    initialize,
    reset,
    dispose: () => {
      epoch += 1;
      return lifecycle.dispose();
    },
  });
}
