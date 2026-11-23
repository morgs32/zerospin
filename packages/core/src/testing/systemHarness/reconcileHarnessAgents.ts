import { makeZerospinError } from '@zerospin/error';
import { makeIdFromAbbreviation } from '@zerospin/shapes';
import { asc, eq } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Clock from 'effect/Clock';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import * as Scope from 'effect/Scope';

import type { IAgentRelease } from '../../agent/AgentReleaseSchema.ts';
import { getSelectedAggregateAgentReleases } from '../../agent/getSelectedAggregateAgentReleases.ts';
import { getSelectedServiceAgentReleases } from '../../agent/getSelectedServiceAgentReleases.ts';
import {
  AgentWakeDeadlineError,
  makeAgentViewMaterialization,
} from '../../agent/materializeAgentView.ts';
import { pendingAgentWakesDbConfig } from '../../agent/pendingAgentWakesDbConfig.ts';
import type { IAgentStagedCommand } from '../../agent/runAgentWake.ts';
import {
  UnknownAggregateCommandSchema,
  UnknownServiceCommandSchema,
} from '../../contracts/CommandSchema.ts';
import { decodeAndAdaptPayload } from '../../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import { makeTx } from '../../drizzle/make/makeTx.ts';
import type { IDb } from '../../drizzle/types.ts';
import type { makeOwnerReleaseLayerProvider } from '../../execution/provideReleaseLayer.ts';
import { makeSelectedResourceDelta } from '../../models/reads/makeSelectedResourceDelta.ts';
import { readSelectedResources } from '../../models/reads/readSelectedResources.ts';
import type { IEncodedResourceShape } from '../../models/types.ts';
import type { ISystem } from '../../system/types.ts';

import type {
  IHarnessOwnerStore,
  IHarnessStore,
  IQueuedHarnessWork,
} from './executionTypes.ts';
import { openHarnessDb } from './openHarnessDb.ts';
import type { ISystemHarnessCommand } from './types.ts';

/** The harness uses the same callback interpreter and pending-wake schema as the durable host. */
export const makeHarnessAgents = Effect.fn('makeHarnessAgents')(function* (
  system: ISystem,
  provideReleaseLayer: ReturnType<typeof makeOwnerReleaseLayerProvider>,
) {
  const scope = yield* Effect.scope;
  const pending = pendingAgentWakesDbConfig.schema.pendingAgentCommands;
  const instances = new Map<
    string,
    {
      db: IDb<typeof pendingAgentWakesDbConfig>;
      resources: readonly IEncodedResourceShape[];
      paused: boolean;
      lastProducerIndex: number;
      view: ReturnType<typeof makeAgentViewMaterialization>;
    }
  >();
  function definitions(store: IHarnessStore) {
    const selected =
      store.kind === 'aggregate'
        ? getSelectedAggregateAgentReleases(system)
        : getSelectedServiceAgentReleases(system);
    return selected
      .filter(binding => binding.release === store.release)
      .map(binding => binding.agent);
  }
  const resources = (store: IHarnessStore, agent: IAgentRelease) =>
    readSelectedResources({
      db: store.db,
      models: agent.db.models,
      exposedModels: agent.db.models,
      selections: agent.selections,
      requireReferenceClosure: false,
    });
  const record = Effect.fn(function* (
    agent: IAgentRelease,
    store: IHarnessStore,
    stages: readonly IAgentStagedCommand[],
  ) {
    const commands: ISystemHarnessCommand[] = [];
    for (const stage of stages) {
      const input = {
        id: stage.id,
        commandName: stage.commandName,
        contractVersion: stage.contractVersion,
        payload: yield* decodeAndAdaptPayload(
          store.release.contracts[stage.commandName]!,
          { command: stage },
        ),
        kind: 'agent',
        agentName: agent.agentName,
        agentVersion: agent.agentVersion,
      };
      commands.push(
        store.kind === 'aggregate'
          ? Schema.decodeUnknownSync(UnknownAggregateCommandSchema)({
              ...input,
              aggregateName: store.release.name,
              aggregateVersion: store.release.version,
              aggregateId: store.aggregateId,
            })
          : Schema.decodeUnknownSync(UnknownServiceCommandSchema)({
              ...input,
              serviceName: store.release.name,
              serviceVersion: store.release.version,
            }),
      );
    }
    return commands;
  });
  const instance = Effect.fn(function* (
    store: IHarnessStore,
    agent: IAgentRelease,
  ) {
    const key = JSON.stringify([
      store.kind,
      store.release.name,
      store.kind === 'aggregate' ? store.aggregateId : null,
      agent.agentName,
      agent.agentVersion,
    ]);
    const existing = instances.get(key);
    if (existing !== undefined) return existing;
    const db = yield* openHarnessDb(pendingAgentWakesDbConfig).pipe(
      Effect.provideService(Scope.Scope, scope),
    );
    const current = {
      db,
      resources: yield* resources(store, agent),
      view: makeAgentViewMaterialization(agent, store.release.contracts),
      paused: false,
      lastProducerIndex: 0,
    };
    const installation = yield* Effect.exit(
      makeTx('HarnessAgent.install')(function* (tx) {
        yield* Effect.sync(() => current.view.install(tx, current.resources));
      })(db),
    );
    if (Exit.isFailure(installation)) {
      if (
        !installation.cause.reasons.some(
          reason =>
            Cause.isDieReason(reason) &&
            reason.defect instanceof AgentWakeDeadlineError,
        )
      ) {
        return yield* Effect.failCause(installation.cause);
      }
      current.paused = true;
    }
    instances.set(key, current);
    return current;
  });
  // An owner may commit once while only some of its Agents have confirmed that command.
  const confirmations = new Map<
    IHarnessStore,
    { id: ISystemHarnessCommand['id']; remaining: Set<IAgentRelease> }
  >();
  const catchUp = Effect.fn('HarnessAgent.catchUp')(
    function* (store: IHarnessStore) {
      const confirmation = confirmations.get(store);
      if (!confirmation) return;
      for (const agent of confirmation.remaining) {
        const current = yield* instance(store, agent);
        if (!current.paused) {
          const next = yield* resources(store, agent);
          const delta = makeSelectedResourceDelta({
            before: current.resources,
            after: next,
          });
          yield* makeTx('HarnessAgent.applySelectedDelta')(function* (tx) {
            current.view.applyDelta(tx, delta);
            tx.delete(pending).where(eq(pending.id, confirmation.id)).run();
          })(current.db);
          current.resources = next;
        }
        confirmation.remaining.delete(agent);
      }
      confirmations.delete(store);
    },
    Effect.mapError(() => makeZerospinError('system-harness-agent-failed')),
    Effect.uninterruptible,
  );

  const runDueWakes = Effect.fn('HarnessAgent.runDueWakes')(function* (
    store: IHarnessStore,
    queue: IQueuedHarnessWork[],
  ) {
    yield* catchUp(store);
    for (const agent of definitions(store)) {
      const current = yield* instance(store, agent);
      if (current.paused) continue;
      const now = yield* Clock.currentTimeMillis;
      for (const wake of current.view.dueWakes(current.db, now)) {
        yield* makeTx('HarnessAgent.consumeWake')(function* (tx) {
          const staged: IAgentStagedCommand[] = [];
          const previous = tx
            .select()
            .from(pending)
            .orderBy(asc(pending.producerIndex))
            .all();
          yield* current.view.consumeWake(tx, wake, {
            ...(store.kind === 'aggregate'
              ? { aggregateId: store.aggregateId }
              : {}),
            pending: previous,
            enqueue: (commandTx, stage) =>
              Effect.sync(() => {
                const producerIndex =
                  current.lastProducerIndex + staged.length + 1;
                commandTx
                  .insert(pending)
                  .values({ ...stage, producerIndex })
                  .run();
                staged.push(stage);
              }),
          });
          return yield* record(agent, store, staged);
        })(current.db).pipe(
          program => provideReleaseLayer(store.release, program),
          Effect.tap(commands =>
            Effect.sync(() => {
              current.lastProducerIndex += commands.length;
              for (const command of commands) {
                queue.push({ kind: 'agent', command });
              }
            }),
          ),
          // The committed wake must enter the harness queue even if this flush is interrupted.
          Effect.uninterruptible,
        );
      }
    }
  });
  return {
    initialize: (stores: readonly IHarnessStore[]) =>
      Effect.gen(function* () {
        for (const store of stores) {
          for (const agent of definitions(store)) yield* instance(store, agent);
        }
      }),
    retainConfirmation: (
      store: IHarnessStore,
      id: ISystemHarnessCommand['id'],
    ) => {
      confirmations.set(store, { id, remaining: new Set(definitions(store)) });
    },
    catchUp,
    reconcile: (
      stores: readonly IHarnessOwnerStore[],
      queue: IQueuedHarnessWork[],
    ) =>
      Effect.gen(function* () {
        for (const store of stores) {
          yield* store.execution.withPermits(1)(runDueWakes(store, queue));
        }
      }),
  };
});
