import { makeZerospinError } from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { createStore } from 'zustand/vanilla';

import {
  AggregateAgentSessionSnapshotSchema,
  type IAggregateAgentSessionSnapshot,
} from '../agent/AggregateAgentSessionSnapshotSchema.ts';
import type {
  IAgentConnectionState,
  IAggregateAgentRelease,
} from '../agent/types.ts';
import { AggregateExposedCommandSchema } from '../aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema.ts';
import type {
  IAggregateExposedCommand,
  ISessionId,
} from '../aggregateSession/types.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import type {
  IResourceDbConfig,
  ISqliteDrizzleDb,
  ITx,
} from '../drizzle/types.ts';
import { applySelectedResourcesTx } from '../Node/applySelectedResourcesTx.ts';
import { isolateSessionStoreObservers } from '../sessionFailure/isolateSessionStoreObservers.ts';

import { aggregateAgentNodeDbConfig } from './aggregateAgentNodeDbConfig.ts';
import type { IAgentNodeView, IAggregateAgentNodeState } from './types.ts';

/** Observe selected canonical resources; automatic execution belongs to the System host. */
export class AggregateAgentNode<
  RELEASE extends IAggregateAgentRelease = IAggregateAgentRelease,
> {
  private readonly publication = (() => {
    const store = createStore<IAggregateAgentNodeState>(() => ({
      view: null,
      connection: { status: 'loading', error: null },
      aggregateIndex: null,
      dispositionChainHash: null,
    }));
    isolateSessionStoreObservers(store);
    return store;
  })();

  readonly store = Object.freeze({
    getState: this.publication.getState,
    getInitialState: this.publication.getInitialState,
    subscribe: this.publication.subscribe,
  });

  private readonly context;
  private disposed = false;
  private fenced = false;
  private viewEpoch = 0;
  private view: IAgentNodeView | null = null;
  private environment: string | null = null;

  constructor(
    private readonly props: {
      agentRelease: RELEASE;
      aggregateName: string;
      aggregateVersion: number;
      sessionId: ISessionId;
      aggregateId: string;
      db: ISqliteDrizzleDb<
        IResourceDbConfig<
          RELEASE['db']['models'],
          typeof aggregateAgentNodeDbConfig.tables
        >
      >;
      runSync<A, E>(program: Effect.Effect<A, E, unknown>): A;
    },
  ) {
    const runSync = props.runSync.bind(props);
    const { db } = props;
    this.context = runSync(Effect.context<unknown>());
    const table = aggregateAgentNodeDbConfig.schema.nodeMetadata;
    if (db.select().from(table).get() !== undefined) {
      throw makeZerospinError('agent-node-storage-not-empty');
    }
    db.insert(table)
      .values({
        singleton: 1,
        aggregateIndex: null,
        dispositionChainHash: null,
      })
      .run();
  }

  get sessionId() {
    return this.props.sessionId;
  }

  get aggregateId() {
    return this.props.aggregateId;
  }

  get resume() {
    const metadata = this.metadata();
    if (
      metadata.aggregateIndex === null ||
      metadata.dispositionChainHash === null
    ) {
      throw makeZerospinError('agent-node-baseline-missing');
    }
    return {
      nodeId: this.sessionId,
      aggregateIndex: metadata.aggregateIndex,
      dispositionChainHash: metadata.dispositionChainHash,
    };
  }

  setConnection(connection: IAgentConnectionState) {
    this.assertAlive();
    this.publication.setState({ connection });
  }

  revoke() {
    if (this.disposed) {
      return;
    }
    this.fenced = true;
    this.viewEpoch++;
    this.view = null;
    this.publication.setState({ view: null });
  }

  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.fenced = true;
    this.viewEpoch++;
    this.view = null;
    this.publication.setState({
      view: null,
      connection: { status: 'disposed', error: null },
    });
  }

  validateBootstrap(snapshot: IAggregateAgentSessionSnapshot) {
    this.assertAlive();
    Schema.encodeSync(AggregateAgentSessionSnapshotSchema)(snapshot, {
      onExcessProperty: 'error',
    });
    const definition = this.props.agentRelease;
    if (
      snapshot.aggregateId !== this.props.aggregateId ||
      snapshot.aggregateName !== this.props.aggregateName ||
      snapshot.aggregateVersion !== this.props.aggregateVersion ||
      snapshot.sessionName !== definition.sessionName ||
      snapshot.origin.kind !== 'agent' ||
      snapshot.origin.agentName !== definition.agentName ||
      snapshot.origin.agentVersion !== definition.agentVersion ||
      (this.environment !== null && snapshot.environment !== this.environment)
    ) {
      throw makeZerospinError('agent-session-identity-mismatch');
    }
  }

  /** Install selected resources and their checkpoint in one synchronous transaction. */
  installInitialSnapshot(snapshot: IAggregateAgentSessionSnapshot) {
    this.validateBootstrap(snapshot);
    if (this.metadata().aggregateIndex !== null) {
      throw makeZerospinError('agent-node-baseline-already-installed');
    }
    const identities = new Set<string>();
    for (const resource of snapshot.resources) {
      const identity = JSON.stringify([resource.modelName, resource.id]);
      if (identities.has(identity)) {
        throw makeZerospinError('agent-node-resource-conflict');
      }
      identities.add(identity);
    }
    this.reconcile(tx =>
      Effect.gen({ self: this }, function* () {
        yield* applySelectedResourcesTx({
          tx,
          models: this.props.agentRelease.db.models,
          delta: { upserted: snapshot.resources, deleted: [] },
          replace: true,
        });
        this.retainCheckpointTx(tx, snapshot);
      }),
    );
    this.environment = snapshot.environment;
  }

  /** Covered replay is inert; new deltas commit with their contiguous checkpoint. */
  applyPage(commands: readonly IAggregateExposedCommand[]) {
    if (this.metadata().aggregateIndex === null) {
      throw makeZerospinError('agent-node-baseline-missing');
    }
    this.reconcile(tx =>
      Effect.gen({ self: this }, function* () {
        for (const command of commands) {
          yield* Schema.encodeEffect(AggregateExposedCommandSchema)(command, {
            onExcessProperty: 'error',
          });
          const metadata = this.metadata(tx);
          if (metadata.aggregateIndex === null) {
            return yield* makeZerospinError('agent-node-baseline-missing');
          }
          if (command.aggregateIndex <= metadata.aggregateIndex) {
            if (
              command.aggregateIndex === metadata.aggregateIndex &&
              command.dispositionChainHash !== metadata.dispositionChainHash
            ) {
              return yield* makeZerospinError('agent-node-checkpoint-conflict');
            }
            continue;
          }
          if (command.aggregateIndex !== metadata.aggregateIndex + 1) {
            return yield* makeZerospinError('agent-node-command-index-gap');
          }
          yield* applySelectedResourcesTx({
            tx,
            models: this.props.agentRelease.db.models,
            delta: command.delta,
          });
          this.retainCheckpointTx(tx, command);
        }
      }),
    );
  }

  completeReplay(checkpoint: {
    aggregateIndex: number;
    dispositionChainHash: string;
  }) {
    const current = this.resume;
    if (
      current.aggregateIndex !== checkpoint.aggregateIndex ||
      current.dispositionChainHash !== checkpoint.dispositionChainHash
    ) {
      throw makeZerospinError('agent-node-replay-checkpoint-conflict');
    }
    this.setConnection({ status: 'live', error: null });
  }

  private retainCheckpointTx(
    tx: ITx,
    checkpoint: {
      aggregateIndex: number;
      dispositionChainHash: string;
    },
  ) {
    const table = aggregateAgentNodeDbConfig.schema.nodeMetadata;
    tx.update(table)
      .set({
        aggregateIndex: checkpoint.aggregateIndex,
        dispositionChainHash: checkpoint.dispositionChainHash,
      })
      .where(eq(table.singleton, 1))
      .run();
  }

  private reconcile(
    program: (tx: ITx) => Effect.Effect<void, unknown, unknown>,
  ) {
    this.assertAlive();
    if (this.fenced) {
      throw makeZerospinError('agent-node-reentrant-reconciliation');
    }
    this.fenced = true;
    const epoch = ++this.viewEpoch;
    this.view = null;
    this.publication.setState({ view: null });
    try {
      this.assertAlive();
      if (this.viewEpoch !== epoch) {
        throw makeZerospinError('agent-node-reconciliation-retired');
      }
      this.run(
        makeTx('materializeAggregateAgentObservation')(function* (tx: ITx) {
          yield* program(tx);
        })(this.props.db),
      );
      this.assertAlive();
      if (this.viewEpoch !== epoch) {
        throw makeZerospinError('agent-node-reconciliation-retired');
      }
      this.fenced = false;
      this.makeView();
      const metadata = this.metadata();
      this.publication.setState({
        view: this.view,
        aggregateIndex: metadata.aggregateIndex,
        dispositionChainHash: metadata.dispositionChainHash,
      });
    } catch (error) {
      this.fenced = true;
      this.view = null;
      this.publication.setState({ view: null });
      throw error;
    }
  }

  private makeView() {
    const epoch = ++this.viewEpoch;
    this.view = Object.freeze({
      readSelection: (
        selection: Parameters<IAgentNodeView['readSelection']>[0],
        identity: Readonly<Record<string, string>>,
      ) => {
        this.assertAlive();
        if (this.fenced || this.viewEpoch !== epoch) {
          throw makeZerospinError('agent-node-view-unavailable');
        }
        if (
          !Object.values(this.props.agentRelease.selections).includes(selection)
        ) {
          throw makeZerospinError('agent-node-selection-unavailable');
        }
        return selection.all(this.props.db, identity);
      },
    });
  }

  private metadata(db: Pick<ISqliteDrizzleDb, 'select'> = this.props.db) {
    this.assertAlive();
    const rows = db
      .select()
      .from(aggregateAgentNodeDbConfig.schema.nodeMetadata)
      .all();
    const row = rows[0];
    if (
      rows.length !== 1 ||
      row === undefined ||
      row.singleton !== 1 ||
      (row.aggregateIndex === null) !== (row.dispositionChainHash === null)
    ) {
      throw makeZerospinError('agent-node-metadata-invalid');
    }
    return row;
  }

  private assertAlive() {
    if (this.disposed) {
      throw makeZerospinError('agent-node-disposed');
    }
  }

  private run<A, E>(program: Effect.Effect<A, E, unknown>): A {
    return Effect.runSync(program.pipe(Effect.provideContext(this.context)));
  }
}
