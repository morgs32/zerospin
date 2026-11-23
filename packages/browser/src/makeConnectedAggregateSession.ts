import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeAggregateSessionSpec } from '@zerospin/core/aggregateSession/make/makeAggregateSessionSpec';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
  ISessionId,
} from '@zerospin/core/aggregateSession/types';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { ISessionInitialization } from '@zerospin/core/identity/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import type { IAggregateSessionReplayRequirements } from '@zerospin/core/sessionExecution/requirements';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  ensureZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { readSpanTraceContext, TelemetryBatchSchema } from '@zerospin/logger';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

import { aggregateSessionDiscovery } from './AggregateNode/aggregateSessionDiscovery.ts';
import { makeConnectedAggregateConnection } from './AggregateNode/makeConnectedAggregateConnection.ts';
import { applicationLayer as getApplicationLayer } from './browserSession/applicationLayer.ts';
import { makeCredentialsAdmissionProvider } from './browserSession/makeCredentialsAdmissionProvider';
import type { IBrowserSessionInitializeOptions } from './browserSession/types.ts';
import { makeSessionLifecycle } from './makeSessionLifecycle';
import { openAggregateSessionReplica } from './sessionReplica/openAggregateSessionReplica.ts';
import type { ISessionRuntimeServices } from './sessionRuntime.ts';

export type IConnectedAggregateSessionInputs<
  D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never>,
  C extends Schema.Codec<unknown, unknown>,
> = {
  sharedWorkerUrl: string;
  credentialsSchema: C;
  layer: L &
    Layer.Layer<
      | PublishableKey
      | ZerospinApiUrl
      | Exclude<
          IAggregateSessionReplayRequirements<NoInfer<D>>,
          ISessionRuntimeServices
        >,
      IAnyError,
      never
    >;
  aggregateId: string;
  diagnostics?: boolean;
} & ISessionInitialization<D['claimsSchema'], C>;

/** Construct a cold connected aggregate; the pure declaration stays separate from host wiring. */
export function makeConnectedAggregateSession<
  const D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never>,
  const C extends Schema.Codec<unknown, unknown>,
>(
  props: { definition: D } & IConnectedAggregateSessionInputs<D, L, C>,
): IAggregateSession<D, ISessionRuntimeServices | Layer.Success<L>> & {
  readonly systemName: D['systemName'];
  readonly claimsSchema: D['claimsSchema'];
  readonly credentialsSchema: C;
  initialize(options?: IBrowserSessionInitializeOptions): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication(): Promise<void>;
} {
  const {
    definition,
    layer: suppliedLayer,
    sharedWorkerUrl,
    credentialsSchema,
    aggregateId: requestedAggregateId,
    claims,
    getCredentials,
    expectedClaims,
    diagnostics = false,
  } = props;
  const aggregateId = Schema.decodeUnknownSync(Schema.String)(
    requestedAggregateId,
  );
  const { claimsSchema, systemName } = definition;
  if (
    !Schema.isSchema(credentialsSchema) ||
    suppliedLayer === undefined ||
    !Schema.is(Schema.NonEmptyString)(sharedWorkerUrl)
  ) {
    throw new Error(
      'Connected aggregate sessions require valid credentials, a layer and a SharedWorker URL',
    );
  }
  const layer = getApplicationLayer(suppliedLayer);
  let lifecycle: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
  const coreSession = makeAggregateSession<D, unknown>({
    sessionDefinition: definition,
    onTerminalFailure: () => lifecycle.retire(),
    execution: {
      runSync: program => lifecycle.runSync(program),
      runPromise: (program, options) => lifecycle.runPromise(program, options),
    },
  });
  lifecycle = makeSessionLifecycle({
    layer,
    reportFailure: coreSession.reportFailure,
    store: coreSession.store,
    telemetryCollector: coreSession.store.getState().telemetryCollector,
    infrastructure: Layer.empty,
    onDispose: () => coreSession.release(),
  });
  let clearConnectionAuthentication: (() => Promise<void>) | undefined;
  let authenticationCleared = false;
  let clearingAuthentication: Promise<void> | undefined;
  const admission = makeCredentialsAdmissionProvider({
    claimsSchema,
    credentialsSchema,
    initialization: {
      ...(claims === undefined ? {} : { claims }),
      ...(getCredentials === undefined ? {} : { getCredentials }),
      ...(expectedClaims === undefined ? {} : { expectedClaims }),
    },
  });
  let authenticatedClaims: Readonly<Record<string, unknown>> | undefined;
  let authenticationHost:
    | { apiUrl: string; publishableKey: string }
    | undefined;
  if (
    admission.claims !== undefined &&
    admission.claims.aggregateId !== aggregateId
  ) {
    throw makeZerospinError('session-aggregate-selection-mismatch');
  }
  let registeredSessionId: ISessionId | null = null;
  const initialize = (
    options?: IBrowserSessionInitializeOptions,
  ): Promise<void> => {
    if (authenticationCleared) {
      return Promise.reject(makeZerospinError('node-signed-out'));
    }
    return lifecycle.initialize(({ execution, signal }) =>
      Effect.gen(function* () {
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        if (registeredSessionId !== null) {
          zerospinDevtoolsStore
            .getState()
            .removeAggregateSession(registeredSessionId);
        }
        registeredSessionId = sessionId;
        zerospinDevtoolsStore
          .getState()
          .addAggregateSession({ sessionId, session: coreSession });
        const startedAt = performance.now();
        const startup = Effect.gen(function* () {
          if (diagnostics) {
            yield* Effect.logInfo('Session startup').pipe(
              Effect.annotateLogs({
                phase: 'session.initialize',
                outcome: 'started',
              }),
            );
          }
          const span = diagnostics ? yield* Effect.currentSpan : null;
          const apiUrl = yield* ZerospinApiUrl;
          const publishableKey = Redacted.value(yield* PublishableKey);
          authenticationHost = { apiUrl, publishableKey };
          if (authenticationCleared) {
            return yield* makeZerospinError('node-signed-out');
          }
          const startupDiagnostics: Parameters<
            typeof makeConnectedAggregateConnection
          >[0]['diagnostics'] =
            !diagnostics || span === null
              ? undefined
              : {
                  startupId: sessionId,
                  traceContext: readSpanTraceContext(span),
                  recordPhase: (phase, durationMs, outcome, errorCode) => {
                    try {
                      execution.runSync(
                        Effect.logInfo('Session startup phase').pipe(
                          Effect.annotateLogs({
                            startupId: sessionId,
                            phase,
                            durationMs,
                            outcome,
                            errorCode,
                          }),
                          Effect.withParentSpan(span),
                        ),
                      );
                    } catch {
                      // Diagnostics cannot change startup or survive its closed execution lifetime.
                    }
                  },
                  onTelemetry: incoming => {
                    try {
                      const batch =
                        Schema.decodeUnknownSync(TelemetryBatchSchema)(
                          incoming,
                        );
                      coreSession.store
                        .getState()
                        .telemetryCollector.merge(batch);
                      for (const log of batch.logs) {
                        console[log.level](log.message, log.payload);
                      }
                      for (const completed of batch.spans) {
                        console.info('SharedWorker startup span', completed);
                      }
                    } catch {
                      // Malformed or undeliverable diagnostics never fail the session.
                    }
                  },
                };
          const connection = makeConnectedAggregateConnection({
            signal,
            aggregateId,
            getAdmission: () =>
              execution.runPromise(
                Effect.suspend(() =>
                  authenticationCleared
                    ? makeZerospinError('node-signed-out')
                    : admission.getAdmission(),
                ).pipe(
                  Effect.tap(() =>
                    authenticationCleared
                      ? makeZerospinError('node-signed-out')
                      : Effect.void,
                  ),
                  Effect.map(request => ({ ...request, aggregateId })),
                  encodeRpcOutcome,
                ),
              ),
            sharedWorkerUrl,
            expectedClaims: authenticatedClaims ?? admission.claims,
            retryConnection: options?.retryConnection,
            onProtocolFailure: error => {
              if (!signal.aborted) {
                coreSession.reportFailure({ origin: 'session', error });
              }
            },
            diagnostics: startupDiagnostics,
            request: {
              apiUrl,
              publishableKey,
              systemName,
              aggregateName: definition.aggregateName,
              aggregateVersion: definition.aggregateVersion,
              sessionName: definition.sessionName,
              lock: makeAggregateSessionSpec(definition).aggregateSessionLock,
            },
          });
          clearConnectionAuthentication = () =>
            Effect.runPromise(connection.clearAuthentication);
          const replica = yield* openAggregateSessionReplica({
            session: coreSession,
            sessionId,
            execution,
            reportFailure: coreSession.reportFailure,
            signal,
            expectedClaims: authenticatedClaims ?? admission.claims,
            onAuthenticatedClaims: claims => {
              if (claims.aggregateId !== aggregateId) {
                throw makeZerospinError('session-aggregate-selection-mismatch');
              }
              assertSessionClaims(authenticatedClaims, claims);
              authenticatedClaims ??= structuredClone(claims);
            },
            connection,
            diagnostics: startupDiagnostics,
          });
          yield* connection.start(replica);
          if (signal.aborted) return;
          zerospinDevtoolsStore.getState().addAggregateSession({
            sessionId,
            session: coreSession,
            getPushPaused: () =>
              execution.runPromise(
                connection.getPushPaused.pipe(encodeRpcOutcome),
              ),
            setPushPaused: (pushPausedProps: { pushPaused: boolean }) =>
              execution.runPromise(
                connection
                  .setPushPaused(pushPausedProps)
                  .pipe(encodeRpcOutcome),
              ),
            pushNow: () =>
              execution.runPromise(connection.pushNow.pipe(encodeRpcOutcome)),
          });
        });
        yield* diagnostics
          ? startup.pipe(
              Effect.onExit(exit => {
                const error = Exit.isFailure(exit)
                  ? Cause.squash(exit.cause)
                  : null;
                return Effect.logInfo('Session startup complete').pipe(
                  Effect.annotateLogs({
                    phase: 'session.initialize',
                    durationMs: performance.now() - startedAt,
                    outcome:
                      Exit.isFailure(exit) &&
                      !Cause.hasInterruptsOnly(exit.cause)
                        ? 'failed'
                        : signal.aborted || Exit.isFailure(exit)
                          ? 'cancelled'
                          : 'ready',
                    errorCode:
                      error !== null &&
                      typeof error === 'object' &&
                      'code' in error
                        ? String(error.code)
                        : null,
                  }),
                );
              }),
              Effect.withSpan('session.initialize'),
              Effect.annotateLogs({ startupId: sessionId }),
            )
          : startup;
      }),
    );
  };
  const dispose = (): Promise<void> => {
    if (registeredSessionId !== null) {
      zerospinDevtoolsStore
        .getState()
        .removeAggregateSession(registeredSessionId);
      registeredSessionId = null;
    }
    return lifecycle.dispose();
  };
  const clearAuthentication = (): Promise<void> => {
    authenticationCleared = true;
    if (clearingAuthentication !== undefined) return clearingAuthentication;
    clearingAuthentication = (async () => {
      let failure: { error: unknown } | undefined;
      try {
        await clearConnectionAuthentication?.();
      } catch (error) {
        failure ??= { error };
      }
      try {
        await dispose();
      } catch (error) {
        failure ??= { error };
      }
      try {
        const knownClaims = authenticatedClaims ?? admission.claims;
        if (knownClaims === undefined) {
          throw makeZerospinError({
            code: 'session-authentication-identity-unavailable',
            message:
              'Provide expectedClaims to clear authentication before a session has authenticated.',
          });
        }
        // Discovery revocation outlives execution and keeps its captured host identity.
        const host = (authenticationHost ??= await Effect.runPromise(
          Effect.gen(function* () {
            return {
              apiUrl: yield* ZerospinApiUrl,
              publishableKey: Redacted.value(yield* PublishableKey),
            };
          }).pipe(Effect.provide(suppliedLayer)),
        ));
        await aggregateSessionDiscovery.update(
          {
            ...host,
            systemName,
            aggregateName: definition.aggregateName,
            aggregateVersion: definition.aggregateVersion,
            sessionName: definition.sessionName,
            lock: makeAggregateSessionSpec(definition).aggregateSessionLock,
          },
          knownClaims,
          aggregateId,
          0,
          false,
        );
      } catch (error) {
        failure ??= {
          error: ensureZerospinError({
            code: 'node-discovery-incomplete',
            error,
          }),
        };
      }
      if (failure !== undefined) {
        throw failure.error;
      }
    })().finally(() => {
      clearingAuthentication = undefined;
    });
    return clearingAuthentication;
  };

  // Browser methods extend the stable core session shared with DevTools.
  return Object.assign(coreSession, {
    systemName,
    claimsSchema,
    credentialsSchema,
    initialize,
    dispose,
    clearAuthentication,
  });
}
