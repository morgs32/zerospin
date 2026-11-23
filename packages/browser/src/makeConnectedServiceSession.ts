import type { ISessionId } from '@zerospin/core/aggregateSession/types';
import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { ISessionInitialization } from '@zerospin/core/identity/types';
import { PublishableKey } from '@zerospin/core/services/PublishableKey';
import { ZerospinApiUrl } from '@zerospin/core/services/ZerospinApiUrl';
import { makeServiceSession as makeCoreServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { makeServiceSessionSpec } from '@zerospin/core/serviceSession/make/makeServiceSessionSpec';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import type { IServiceSessionReplayRequirements } from '@zerospin/core/sessionExecution/requirements';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { encodeRpcOutcome } from '@zerospin/core/utils/encodeRpcOutcome';
import { zerospinDevtoolsStore } from '@zerospin/devtools/zerospinDevtoolsStore';
import {
  ensureZerospinError,
  makeZerospinError,
  type IAnyError,
} from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Redacted from 'effect/Redacted';
import * as Schema from 'effect/Schema';

import { applicationLayer as getApplicationLayer } from './browserSession/applicationLayer.ts';
import { makeServiceAdmissionProvider } from './browserSession/makeServiceAdmissionProvider';
import type { IBrowserSessionInitializeOptions } from './browserSession/types.ts';
import { makeSessionLifecycle } from './makeSessionLifecycle';
import { makeConnectedServiceConnection } from './ServiceNode/makeConnectedServiceConnection.ts';
import { serviceSessionDiscovery } from './ServiceNode/serviceSessionDiscovery.ts';
import { openServiceSessionReplica } from './sessionReplica/openServiceSessionReplica.ts';
import type { ISessionRuntimeServices } from './sessionRuntime.ts';

export type IConnectedServiceSessionInputs<
  D extends IServiceSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never>,
  C extends Schema.Codec<unknown, unknown> | undefined = undefined,
> = {
  sharedWorkerUrl: string;
  credentialsSchema?: C;
  diagnostics?: boolean;
  layer: L &
    Layer.Layer<
      | PublishableKey
      | ZerospinApiUrl
      | Exclude<
          IServiceSessionReplayRequirements<NoInfer<D>>,
          ISessionRuntimeServices
        >,
      IAnyError,
      never
    >;
} & ISessionInitialization<D['claimsSchema'], C>;

/** Construct a cold connected service; the pure declaration stays separate from host wiring. */
export function makeConnectedServiceSession<
  const D extends IServiceSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never>,
  const C extends Schema.Codec<unknown, unknown> | undefined = undefined,
>(
  props: { definition: D } & IConnectedServiceSessionInputs<D, L, C>,
): IServiceSession<
  D,
  D['models'],
  ISessionRuntimeServices | Layer.Success<L>
> & {
  readonly systemName: D['systemName'];
  readonly claimsSchema: D['claimsSchema'];
  readonly credentialsSchema: C | undefined;
  initialize(options?: IBrowserSessionInitializeOptions): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication(): Promise<void>;
} {
  const {
    definition,
    layer: suppliedLayer,
    sharedWorkerUrl,
    credentialsSchema,
    claims,
    getCredentials,
    expectedClaims,
    diagnostics = false,
  } = props;
  const { claimsSchema, systemName } = definition;
  if (
    (credentialsSchema !== undefined && !Schema.isSchema(credentialsSchema)) ||
    suppliedLayer === undefined ||
    !Schema.is(Schema.NonEmptyString)(sharedWorkerUrl)
  ) {
    throw new Error(
      'Connected service sessions require valid credentials, a layer and a SharedWorker URL',
    );
  }
  const layer = getApplicationLayer(suppliedLayer);
  let lifecycle: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
  const coreSession = makeCoreServiceSession<D, D['models'], unknown>({
    sessionDefinition: definition,
    onTerminalFailure: () => lifecycle.retire(),
    execution: {
      runSync: program => lifecycle.runSync(program),
      runPromise: (program, options) => lifecycle.runPromise(program, options),
    },
    models: definition.models,
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
  const admission = makeServiceAdmissionProvider({
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
            .removeServiceSession(registeredSessionId);
        }
        registeredSessionId = sessionId;
        zerospinDevtoolsStore
          .getState()
          .addServiceSession({ sessionId, session: coreSession });
        let startedAt = 0;
        if (diagnostics) {
          try {
            startedAt = performance.now();
          } catch {
            // Timing is optional diagnostic context.
          }
        }
        const startup = Effect.gen(function* () {
          const span = diagnostics ? yield* Effect.currentSpan : null;
          const apiUrl = yield* ZerospinApiUrl;
          const publishableKey = Redacted.value(yield* PublishableKey);
          authenticationHost = { apiUrl, publishableKey };
          if (authenticationCleared) {
            return yield* makeZerospinError('node-signed-out');
          }
          const connection = makeConnectedServiceConnection({
            signal,
            diagnostics:
              span === null
                ? undefined
                : {
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
                        // Diagnostics cannot change startup or outlive the execution runtime.
                      }
                    },
                  },
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
            request: {
              apiUrl,
              publishableKey,
              systemName,
              serviceName: definition.serviceName,
              serviceVersion: definition.serviceVersion,
              sessionName: definition.sessionName,
              lock: makeServiceSessionSpec(definition).serviceSessionLock,
            },
          });
          clearConnectionAuthentication = () =>
            Effect.runPromise(connection.clearAuthentication);
          const replica = yield* openServiceSessionReplica({
            session: coreSession,
            sessionId,
            execution,
            reportFailure: coreSession.reportFailure,
            signal,
            expectedClaims: authenticatedClaims ?? admission.claims,
            onAuthenticatedClaims: claims => {
              assertSessionClaims(authenticatedClaims, claims);
              authenticatedClaims ??= structuredClone(claims);
            },
            connection,
          });
          yield* connection.start(replica);
          if (signal.aborted) return;
        });
        yield* diagnostics
          ? startup.pipe(
              Effect.onExit(exit => {
                const error = Exit.isFailure(exit)
                  ? Cause.squash(exit.cause)
                  : null;
                return Effect.suspend(() =>
                  Effect.logInfo('Session startup complete').pipe(
                    Effect.annotateLogs({
                      startupId: sessionId,
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
                  ),
                ).pipe(Effect.catchCause(() => Effect.void));
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
        .removeServiceSession(registeredSessionId);
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
        await serviceSessionDiscovery.update(
          {
            ...host,
            systemName,
            serviceName: definition.serviceName,
            serviceVersion: definition.serviceVersion,
            sessionName: definition.sessionName,
            lock: makeServiceSessionSpec(definition).serviceSessionLock,
          },
          knownClaims,
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
  return Object.assign(coreSession, {
    systemName,
    claimsSchema,
    credentialsSchema,
    initialize,
    dispose,
    clearAuthentication,
  });
}
