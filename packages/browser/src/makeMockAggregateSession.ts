import { aggregateSessionRepoDbConfig } from '@zerospin/core/aggregateSession/aggregateSessionRepoDbConfig';
import { makeAggregateSession } from '@zerospin/core/aggregateSession/make/makeAggregateSession';
import { makeInitializedAggregateSession } from '@zerospin/core/aggregateSession/makeInitializedAggregateSession';
import type {
  IAggregateSession,
  IAggregateSessionDefinition,
} from '@zerospin/core/aggregateSession/types';
import {
  GENESIS_EXECUTED_PREIMAGE,
  hashDispositionChain,
} from '@zerospin/core/contracts/dispositionChainHash';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { ITx } from '@zerospin/core/drizzle/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';

import { applicationLayer } from './browserSession/applicationLayer.ts';
import { makeSessionLifecycle } from './makeSessionLifecycle.ts';
import { captureMockInputs } from './mockSession/captureMockInputs.ts';
import { seedMockResourcesTx } from './mockSession/seedMockResourcesTx.ts';
import type {
  IMockBrowserSessionInputs,
  IMockBrowserSessionLayer,
} from './mockSession/types.ts';
import { openAggregateReplica } from './sessionReplica/openAggregateReplica.ts';
import type { ISessionRuntimeServices } from './sessionRuntime.ts';

export type IMockAggregateSessionInputs<
  D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
> = IMockBrowserSessionInputs<NoInfer<D>> &
  IMockBrowserSessionLayer<NoInfer<D>, L>;

/** Construct a cold seeded mock aggregate with its existing local execution semantics. */
export function makeMockAggregateSession<
  const D extends IAggregateSessionDefinition,
  L extends Layer.Layer<never, IAnyError, never> = Layer.Layer<never>,
>(
  props: { definition: D } & IMockAggregateSessionInputs<D, L>,
): IAggregateSession<D, ISessionRuntimeServices | Layer.Success<L>> & {
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
  const aggregateId = Schema.decodeUnknownSync(Schema.String)(
    claims.aggregateId,
  );
  let lifecycle: ReturnType<typeof makeSessionLifecycle<unknown, never>>;
  const session = makeAggregateSession<D, unknown>({
    sessionDefinition,
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
        const replica = yield* openAggregateReplica({
          session,
          sessionId,
          signal,
        });
        const dispositionChainHash = yield* Effect.promise(() =>
          hashDispositionChain(GENESIS_EXECUTED_PREIMAGE),
        );
        yield* makeTx('seedMockAggregateSession')(function* (tx: ITx) {
          yield* seedMockResourcesTx({ tx, models: replica.models, resources });
          tx.insert(aggregateSessionRepoDbConfig.schema.sessionMetadata)
            .values({
              sessionId,
              lastSessionIndex: 0,
              afterNodeIndex: 0,
              aggregateIndex: 0,
              dispositionChainHash,
            })
            .run();
        })(replica.db);
        const initialized = yield* makeInitializedAggregateSession({
          sessionDefinition,
          db: replica.db,
          admitted: {
            sessionId,
            aggregateId,
            actorName: sessionDefinition.actorName,
            actorVersion: sessionDefinition.actorVersion,
            claims,
          },
        });
        if (signal.aborted) return;
        session.store.setState({
          status: 'ready',
          initialized,
          aggregateIndex: 0,
          dispositionChainHash,
          pushIndex: 0,
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
