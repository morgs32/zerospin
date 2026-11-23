import {
  GENESIS_EXECUTED_PREIMAGE,
  hashDispositionChain,
} from '@zerospin/core/contracts/dispositionChainHash';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { makeServiceSession } from '@zerospin/core/serviceSession/make/makeServiceSession';
import { serviceSessionRepoDbConfig } from '@zerospin/core/serviceSession/serviceSessionRepoTables';
import type {
  IServiceSession,
  IServiceSessionDefinition,
} from '@zerospin/core/serviceSession/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import { applicationLayer } from './browserSession/applicationLayer.ts';
import { makeSessionLifecycle } from './makeSessionLifecycle.ts';
import { bindMockServiceCommands } from './mockSession/bindMockServiceCommands.ts';
import { captureMockInputs } from './mockSession/captureMockInputs.ts';
import { seedMockResourcesTx } from './mockSession/seedMockResourcesTx.ts';
import type {
  IMockBrowserSessionInputs,
  IMockBrowserSessionLayer,
} from './mockSession/types.ts';
import { openServiceReplica } from './sessionReplica/openServiceReplica.ts';
import type { ISessionRuntimeServices } from './sessionRuntime.ts';

export type IMockServiceSessionInputs<
  D extends IServiceSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
> = IMockBrowserSessionInputs<NoInfer<D>> &
  IMockBrowserSessionLayer<NoInfer<D>, L>;

/** Construct a cold seeded mock service with its existing local execution semantics. */
export function makeMockServiceSession<
  const D extends IServiceSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
>(
  props: { definition: D } & IMockServiceSessionInputs<D, L>,
): IServiceSession<
  D,
  D['models'],
  ISessionRuntimeServices | Layer.Success<L>
> & {
  readonly systemName: D['systemName'];
  readonly claimsSchema: D['claimsSchema'];
  initialize(): Promise<void>;
  dispose(): Promise<void>;
  clearAuthentication(): Promise<void>;
} {
  const {
    definition: sessionDefinition,
    layer,
    claims: initialClaims,
    resources: initialResources,
  } = props;
  const inputs = captureMockInputs(sessionDefinition, {
    claims: initialClaims,
    ...(initialResources === undefined ? {} : { resources: initialResources }),
  });
  const { claims, resources } = inputs;
  const encodedClaims = Object.freeze(
    Schema.encodeSync(sessionDefinition.claimsSchema)(structuredClone(claims)),
  );
  let lifecycle: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
  const session = makeServiceSession<D, D['models'], unknown>({
    sessionDefinition,
    models: sessionDefinition.models,
    onTerminalFailure: () => lifecycle.retire(),
    execution: {
      runSync: program => lifecycle.runSync(program),
      runPromise: (program, options) => lifecycle.runPromise(program, options),
    },
  });
  lifecycle = makeSessionLifecycle({
    layer: applicationLayer(layer),
    reportFailure: session.reportFailure,
    store: session.store,
    telemetryCollector: session.store.getState().telemetryCollector,
    infrastructure: Layer.empty,
    onDispose: () => session.release(),
  });
  const initialize = () =>
    lifecycle.initialize(({ signal }) =>
      Effect.gen(function* () {
        const sessionId = yield* makeIdFromAbbreviation({
          abbreviation: coreAbbreviations.session,
        });
        const replica = yield* openServiceReplica({
          session,
          signal,
        });
        const dispositionChainHash = yield* Effect.promise(() =>
          hashDispositionChain(GENESIS_EXECUTED_PREIMAGE),
        );
        yield* makeTx('seedMockServiceSession')(function* (tx: ITx) {
          yield* seedMockResourcesTx({ tx, models: replica.models, resources });
          tx.insert(serviceSessionRepoDbConfig.schema.serviceSessionMetadata)
            .values({
              lastSessionIndex: 0,
              afterNodeIndex: 0,
              serviceIndex: 0,
              dispositionChainHash,
            })
            .run();
        })(replica.db);
        yield* bindMockServiceCommands({
          session,
          sessionId,
          replica,
          signal,
          getEncodedClaims: () => structuredClone(encodedClaims),
        });
        if (signal.aborted) return;
        session.store.setState({
          status: 'ready',
          initialized: {
            sessionId,
            get claims() {
              return structuredClone(claims);
            },
            get encodedClaims() {
              return structuredClone(encodedClaims);
            },
            serviceName: sessionDefinition.serviceName,
            serviceVersion: sessionDefinition.serviceVersion,
            sessionName: sessionDefinition.sessionName,
            serviceSessionLockKey: replica.serviceSessionLockKey,
            db: replica.db,
            schema: replica.dbConfig.schema,
            models: replica.models,
            serviceIndex: 0,
            dispositionChainHash,
          },
        });
      }),
    );
  return Object.assign(session, {
    systemName: sessionDefinition.systemName,
    claimsSchema: sessionDefinition.claimsSchema,
    initialize,
    dispose: lifecycle.dispose,
    clearAuthentication: () =>
      Promise.reject(makeZerospinError('mock-session-transport-unsupported')),
  });
}
