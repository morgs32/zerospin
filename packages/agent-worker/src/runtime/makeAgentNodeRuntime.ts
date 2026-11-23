import type { IAgentRelease } from '@zerospin/core/agent/AgentReleaseSchema';
import {
  AgentWakeDeadlineError,
  makeAgentViewMaterialization,
} from '@zerospin/core/agent/materializeAgentView';
import type { IAnyContracts } from '@zerospin/core/contracts/types';
import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { withSavepoint } from '@zerospin/core/drizzle/withSavepoint';
import type { IOwnerReleaseLayer } from '@zerospin/core/execution/ownerReleaseLayer';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import type { IEncodedResourceShape } from '@zerospin/core/models/types';
import { makeZerospinError } from '@zerospin/error';
import { dropAgentMaterializedTables } from '@zerospin/system-worker/agentNodeRepo/agentMaterializedTables';
import { agentNodeRepoDbConfig } from '@zerospin/system-worker/agentNodeRepo/agentNodeRepoDbConfig';
import type {
  IAgentNodeDelivery,
  IAgentNodeExposedCommand,
  IExpectedAgentInstallation,
} from '@zerospin/system-worker/agentNodeRepo/agentNodeRuntimeTypes';
import type { IWakeRegistry } from '@zerospin/system-worker/makeWakeRegistry/makeWakeRegistry';
import { asc, eq } from 'drizzle-orm';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';
import { isEqual } from 'es-toolkit';

export type IAgentNodeHead<SOURCE> = Readonly<{
  source: SOURCE;
  index: number;
  dispositionChainHash: string;
}>;
type ISelectedCommand = IAgentNodeExposedCommand & Readonly<{ index: number }>;
export type IAgentNodeStorage<SOURCE, R> = {
  readHead(
    connection?: Pick<IDb, 'select'>,
  ): IAgentNodeHead<SOURCE> | undefined;
  writeHead(tx: ITx, head: IAgentNodeHead<SOURCE>): void;
  hasPending(connection?: Pick<IDb, 'select'>): boolean;
  discardInstallation(tx: ITx): void;
  drain(generation: number): Effect.Effect<void, unknown, R>;
  enqueue(
    tx: ITx,
    source: SOURCE,
    input: Pick<
      IAgentNodeDelivery,
      | 'generation'
      | 'id'
      | 'commandName'
      | 'contractVersion'
      | 'payload'
      | 'agentVersion'
    >,
  ): Effect.Effect<number, unknown>;
  decodePage(
    input: unknown,
  ): Effect.Effect<
    { rows: readonly ISelectedCommand[]; lastIndex: number },
    unknown
  >;
};
const { schema, tables } = agentNodeRepoDbConfig;

/** Selected resources, callback progress, wakes and complete emitted commands commit together. */
export function makeAgentNodeRuntime<
  SOURCE extends { agentVersion: number },
  E,
  R,
>(props: {
  db: IDb;
  aggregateId?: string;
  agentRelease: IAgentRelease | undefined;
  ownerRelease:
    | { contracts: IAnyContracts; layer?: IOwnerReleaseLayer }
    | undefined;
  installation: IExpectedAgentInstallation;
  source: SOURCE | undefined;
  storage: IAgentNodeStorage<SOURCE, R>;
  wakeRegistry: IWakeRegistry;
  transitionProducer(
    generation: number,
    active: boolean,
  ): Effect.Effect<void, E, R>;
  captureSnapshot(): Effect.Effect<
    IAgentNodeHead<SOURCE> & { resources: readonly IEncodedResourceShape[] },
    E,
    R
  >;
  subscribe(): Effect.Effect<void, E, R>;
  catchup(): Effect.Effect<void, E, R>;
}) {
  const {
    db,
    agentRelease: agent,
    ownerRelease,
    source,
    storage,
    wakeRegistry,
  } = props;
  const materialization =
    agent === undefined || ownerRelease === undefined
      ? undefined
      : makeAgentViewMaterialization(agent, ownerRelease.contracts);
  const installationGate = Semaphore.makeUnsafe(1);
  const advanceGate = Semaphore.makeUnsafe(1);
  let enrolled = false;
  const matches = (other: SOURCE) => isEqual(source, other);
  const binding = props.installation;
  const readState = (connection: Pick<IDb, 'select'> = db) =>
    connection.select().from(schema.initializationState).get();
  const isCurrent = (state: ReturnType<typeof readState>) =>
    state !== undefined &&
    isEqual(
      Effect.runSync(tables.initializationState.decodeRow(state)).binding,
      binding,
    );
  const getReadyGeneration = (connection: Pick<IDb, 'select'> = db) => {
    const state = readState(connection);
    return state?.status === 'ready' && isCurrent(state)
      ? state.generation
      : undefined;
  };
  // Persist the new generation before contacting the Chain. A repeated initialize or alarm
  // resumes this generation after a lost reply and can never send the abandoned outbox.
  const beginInstallation = makeTx('AgentNodeRepo.beginInstallation')(
    function* (tx: ITx) {
      const state = readState(tx);
      if (state !== undefined && isCurrent(state)) return state;
      const generation = (state?.generation ?? 0) + 1;
      if (!Number.isSafeInteger(generation)) {
        return yield* makeZerospinError('agent-node-generation-exhausted');
      }
      const row = yield* tables.initializationState.encodeRow({
        singletonId: 1,
        generation,
        binding: Schema.decodeUnknownSync(Schema.Json)(binding),
        status: source === undefined ? 'stopping' : 'initializing',
        error: null,
        materializedTables: [],
      });
      dropAgentMaterializedTables(tx);
      storage.discardInstallation(tx);
      tx.delete(schema.pendingAgentWakes).run();
      tx.delete(schema.pendingAgentCommands).run();
      tx.delete(schema.producerPosition).run();
      tx.delete(schema.initializationState).run();
      tx.insert(schema.initializationState).values(row).run();
      return row;
    },
  );
  const install = Effect.fn('AgentNodeRepo.initializeSelectedView')(function* (
    retryFailed: boolean,
  ) {
    const state = yield* beginInstallation(db);
    if (
      state.status === 'ready' ||
      state.status === 'stopped' ||
      (state.status === 'initializationFailed' && !retryFailed)
    ) {
      return;
    }
    const { generation } = state;
    enrolled = false;
    yield* props.transitionProducer(generation, source !== undefined);
    if (
      source === undefined ||
      agent === undefined ||
      materialization === undefined
    ) {
      db.update(schema.initializationState)
        .set({ status: 'stopped' })
        .where(eq(schema.initializationState.generation, generation))
        .run();
      return;
    }
    const snapshot = yield* props.captureSnapshot();
    if (!matches(snapshot.source)) {
      return yield* makeZerospinError('agent-node-source-version-mismatch');
    }
    yield* makeTx('AgentNodeRepo.installSnapshot')(function* (tx) {
      if (readState(tx)?.generation !== generation) {
        return yield* makeZerospinError('agent-node-checkpoint-conflict');
      }
      const installation = yield* Effect.exit(
        withSavepoint({
          tx,
          program: ({ tx }) =>
            Effect.sync(() => materialization.install(tx, snapshot.resources)),
        }),
      );
      if (Exit.isFailure(installation)) {
        const error = installation.cause.reasons.find(
          reason =>
            Cause.isDieReason(reason) &&
            reason.defect instanceof AgentWakeDeadlineError,
        );
        if (error === undefined || !Cause.isDieReason(error)) {
          return yield* Effect.failCause(installation.cause);
        }
        tx.update(schema.initializationState)
          .set({ status: 'initializationFailed', error: String(error.defect) })
          .run();
        return;
      }
      storage.writeHead(tx, snapshot);
      const installed = yield* tables.initializationState.encodeRow({
        singletonId: 1,
        generation,
        binding: Schema.decodeUnknownSync(Schema.Json)(binding),
        status: 'ready',
        error: null,
        materializedTables: materialization.definitions,
      });
      tx.update(schema.initializationState).set(installed).run();
    })(db);
    enrolled = false;
  });
  const receive = Effect.fn('AgentNodeRepo.receive')(function* (
    inputSource: SOURCE,
    generation: number | undefined,
    delivery: unknown,
  ) {
    if (!matches(inputSource)) {
      return yield* makeZerospinError('agent-node-source-version-mismatch');
    }
    if (generation === undefined || getReadyGeneration() !== generation) {
      return yield* makeZerospinError('agent-node-initialization-required');
    }
    const page = yield* storage.decodePage(delivery);
    // Each selected delta commits its view, derived wakes and new checkpoint together.
    for (const command of page.rows) {
      yield* makeTx('AgentNodeRepo.applySelectedDelta')(function* (tx) {
        const head = storage.readHead(tx);
        if (
          getReadyGeneration(tx) !== generation ||
          head === undefined ||
          !matches(head.source) ||
          agent === undefined ||
          materialization === undefined
        ) {
          return yield* makeZerospinError('agent-node-checkpoint-conflict');
        }
        if (command.index > page.lastIndex) {
          return yield* makeZerospinError('agent-node-page-invalid');
        }
        if (command.index <= head.index) {
          if (
            command.index === head.index &&
            command.dispositionChainHash !== head.dispositionChainHash
          ) {
            return yield* makeZerospinError('agent-node-checkpoint-conflict');
          }
          return;
        }
        if (command.index !== head.index + 1) {
          return yield* makeZerospinError('session-replay-gap');
        }
        materialization.applyDelta(tx, command.delta);
        // Even a refusal or successful no-op confirms this command's final selected state.
        tx.delete(schema.pendingAgentCommands)
          .where(eq(schema.pendingAgentCommands.id, command.id))
          .run();
        storage.writeHead(tx, {
          source: head.source,
          index: command.index,
          dispositionChainHash: command.dispositionChainHash,
        });
      })(db);
    }
    yield* wakeRegistry.reconcile();
  });
  const synchronize = Effect.fn('AgentNodeRepo.synchronizeAndRunWakes')(
    function* (generation: number) {
      if (
        agent !== undefined &&
        materialization !== undefined &&
        ownerRelease !== undefined &&
        source !== undefined
      ) {
        if (!enrolled) {
          yield* props.subscribe();
          enrolled = true;
        } else {
          yield* props.catchup();
        }
        for (const scheduled of materialization.dueWakes(db, Date.now())) {
          yield* makeTx('AgentNodeRepo.consumeWake')(function* (tx) {
            if (getReadyGeneration(tx) !== generation) return;
            const pending = tx
              .select()
              .from(schema.pendingAgentCommands)
              .orderBy(asc(schema.pendingAgentCommands.producerIndex))
              .all();
            yield* materialization.consumeWake(tx, scheduled, {
              aggregateId: props.aggregateId,
              pending: yield* Effect.forEach(
                pending,
                tables.pendingAgentCommands.decodeRow,
              ),
              enqueue: Effect.fn(function* (tx, stage) {
                const producerIndex = yield* storage.enqueue(tx, source, {
                  id: stage.id,
                  commandName: stage.commandName,
                  contractVersion: stage.contractVersion,
                  payload: stage.payload,
                  generation,
                  agentVersion: agent.agentVersion,
                });
                const row = yield* tables.pendingAgentCommands.encodeRow({
                  ...stage,
                  producerIndex,
                });
                tx.insert(schema.pendingAgentCommands).values(row).run();
              }),
            });
          })(db).pipe(program => provideReleaseLayer(ownerRelease, program));
        }
      }
    },
  );
  const advance = Effect.fn('AgentNodeRepo.advance')(function* () {
    const generation = getReadyGeneration();
    if (generation === undefined) return;
    const synchronization = yield* Effect.exit(synchronize(generation));
    if (getReadyGeneration() !== generation) return;
    const delivery = yield* Effect.exit(storage.drain(generation));
    if (Exit.isFailure(synchronization)) {
      return yield* Effect.failCause(
        Exit.isFailure(delivery)
          ? Cause.combine(synchronization.cause, delivery.cause)
          : synchronization.cause,
      );
    }
    if (Exit.isFailure(delivery)) {
      return yield* Effect.failCause(delivery.cause);
    }
  });
  const pendingTransition = () => {
    const state = readState();
    return (
      isCurrent(state) &&
      (state?.status === 'stopping' || state?.status === 'initializing')
    );
  };
  wakeRegistry.register('agent', {
    readNextWakeAt: () => {
      const ready = getReadyGeneration() !== undefined;
      const deadline = ready
        ? db
            .select({ at: schema.pendingAgentWakes.at })
            .from(schema.pendingAgentWakes)
            .orderBy(asc(schema.pendingAgentWakes.at))
            .get()?.at
        : undefined;
      const retry =
        pendingTransition() || (ready && (storage.hasPending() || !enrolled))
          ? Date.now() + 1000
          : undefined;
      return deadline === undefined
        ? (retry ?? null)
        : Math.min(deadline, retry ?? Infinity);
    },
    run: Effect.gen(function* () {
      if (pendingTransition()) {
        yield* install(false).pipe(installationGate.withPermits(1));
      }
      yield* advance().pipe(advanceGate.withPermits(1));
    }),
  });
  return {
    initialize: (
      retryFailed = false,
      expectedBinding?: IExpectedAgentInstallation,
    ) =>
      Effect.gen(function* () {
        if (
          expectedBinding !== undefined &&
          !isEqual(expectedBinding, binding)
        ) {
          return yield* makeZerospinError('agent-node-deployment-pending');
        }
        yield* install(retryFailed).pipe(
          installationGate.withPermits(1),
          Effect.ensuring(wakeRegistry.reconcile().pipe(Effect.orDie)),
        );
        if (getReadyGeneration() !== undefined) {
          yield* advance().pipe(advanceGate.withPermits(1));
        }
        yield* wakeRegistry.reconcile();
        return readState()?.error ?? null;
      }),
    receive,
    getReadyGeneration,
    getCurrentIndex: () =>
      getReadyGeneration() !== undefined ? (storage.readHead()?.index ?? 0) : 0,
  };
}
