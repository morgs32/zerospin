import type { IAggregateAgentRelease } from '@zerospin/core/agent/types';
import type { IAggregateRelease } from '@zerospin/core/aggregate/types';
import { AggregateExposedCommandSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import type {
  IAgentNodeSnapshot,
  IExpectedAgentInstallation,
} from '@zerospin/system-worker/agentNodeRepo/agentNodeRuntimeTypes';
import { aggregateAgentNodeRepoDbConfig } from '@zerospin/system-worker/AggregateAgentNodeRepo/aggregateAgentNodeRepoDbConfig';
import type { IWakeRegistry } from '@zerospin/system-worker/makeWakeRegistry/makeWakeRegistry';
import { and, asc, eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { allocateAgentProducerIndex } from './allocateAgentProducerIndex.js';
import {
  makeAgentNodeRuntime,
  type IAgentNodeStorage,
} from './makeAgentNodeRuntime.js';

type ISource = Readonly<{ agentVersion: number; aggregateVersion: number }>;
type IDelivery =
  typeof aggregateAgentNodeRepoDbConfig.tables.commandDeliveryOutbox.codec.Type;
const { schema, tables } = aggregateAgentNodeRepoDbConfig;

/** Adapt the existing Aggregate checkpoint, page and frozen delivery formats. */
export function makeAggregateAgentNodeRuntime<E, R>(props: {
  db: IDb;
  aggregateId: string;
  installation: IExpectedAgentInstallation;
  agentRelease: IAggregateAgentRelease | undefined;
  ownerRelease:
    | Pick<IAggregateRelease, 'version' | 'contracts' | 'layer'>
    | undefined;
  wakeRegistry: IWakeRegistry;
  captureSnapshot(): Effect.Effect<
    Extract<IAgentNodeSnapshot, { aggregateVersion: number }>,
    E,
    R
  >;
  subscribe(): Effect.Effect<void, E, R>;
  catchup(): Effect.Effect<void, E, R>;
  transitionProducer(
    generation: number,
    active: boolean,
  ): Effect.Effect<void, E, R>;
  admit(delivery: IDelivery): Effect.Effect<void, E, R>;
}) {
  const admit = props.admit.bind(props);
  const captureSnapshot = props.captureSnapshot.bind(props);
  const { db, agentRelease, ownerRelease, wakeRegistry, subscribe, catchup } =
    props;
  const source =
    agentRelease === undefined || ownerRelease === undefined
      ? undefined
      : {
          agentVersion: agentRelease.agentVersion,
          aggregateVersion: ownerRelease.version,
        };
  const storage: IAgentNodeStorage<ISource, R> = {
    readHead: (connection = db) => {
      const rows = connection.select().from(schema.materializationHead).all();
      if (rows.length > 1) {
        throw makeZerospinError('agent-node-checkpoint-ambiguous');
      }
      const row = rows[0];
      return row === undefined
        ? undefined
        : {
            source: {
              agentVersion: row.agentVersion,
              aggregateVersion: row.aggregateVersion,
            },
            index: row.aggregateIndex,
            dispositionChainHash: row.dispositionChainHash,
          };
    },
    writeHead: (tx, head) => {
      tx.delete(schema.materializationHead).run();
      tx.insert(schema.materializationHead)
        .values({
          ...head.source,
          aggregateIndex: head.index,
          dispositionChainHash: head.dispositionChainHash,
        })
        .run();
    },
    discardInstallation(tx) {
      tx.delete(schema.materializationHead).run();
      tx.delete(schema.commandDeliveryOutbox).run();
    },
    hasPending: (connection = db) =>
      connection
        .select({ id: schema.commandDeliveryOutbox.id })
        .from(schema.commandDeliveryOutbox)
        .get() !== undefined,
    drain: Effect.fn(function* (generation: number) {
      const through =
        db.select().from(schema.producerPosition).get()?.lastIndex ?? 0;
      for (;;) {
        const stored = db
          .select()
          .from(schema.commandDeliveryOutbox)
          .where(eq(schema.commandDeliveryOutbox.generation, generation))
          .orderBy(asc(schema.commandDeliveryOutbox.producerIndex))
          .get();
        if (stored === undefined || stored.producerIndex > through) return;
        const delivery = yield* tables.commandDeliveryOutbox.decodeRow(stored);
        yield* admit(delivery);
        db.delete(schema.commandDeliveryOutbox)
          .where(
            and(
              eq(
                schema.commandDeliveryOutbox.producerIndex,
                delivery.producerIndex,
              ),
              eq(schema.commandDeliveryOutbox.generation, generation),
            ),
          )
          .run();
      }
    }),
    enqueue: Effect.fn(function* (tx, binding, input) {
      const producerIndex = allocateAgentProducerIndex(tx);
      const encoded = yield* tables.commandDeliveryOutbox.encodeRow({
        ...input,
        producerIndex,
        aggregateVersion: binding.aggregateVersion,
      });
      tx.insert(schema.commandDeliveryOutbox).values(encoded).run();
      return producerIndex;
    }),
    decodePage: input =>
      Schema.decodeUnknownEffect(
        Schema.Struct({
          rows: Schema.Array(Schema.toType(AggregateExposedCommandSchema)),
          lastIndex: Schema.Number.check(
            Schema.isInt(),
            Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
          ),
        }),
      )(input, { onExcessProperty: 'error' }).pipe(
        mapParseError({
          code: 'agent-node-page-invalid',
          prefix: 'Invalid Agent selected page',
        }),
        Effect.map(page => ({
          ...page,
          rows: page.rows.map(row => ({
            ...row,
            index: row.aggregateIndex,
            dispositionChainHash: row.dispositionChainHash,
            delta: row.delta,
          })),
        })),
      ),
  };
  return makeAgentNodeRuntime({
    aggregateId: props.aggregateId,
    installation: props.installation,
    ownerRelease,
    db,
    agentRelease,
    wakeRegistry,
    subscribe,
    catchup,
    transitionProducer: props.transitionProducer,
    source,
    storage,
    captureSnapshot: () =>
      captureSnapshot().pipe(
        Effect.map(snapshot => ({
          source: {
            agentVersion: snapshot.agentVersion,
            aggregateVersion: snapshot.aggregateVersion,
          },
          index: snapshot.aggregateIndex,
          dispositionChainHash: snapshot.dispositionChainHash,
          resources: snapshot.resources,
        })),
      ),
  });
}
