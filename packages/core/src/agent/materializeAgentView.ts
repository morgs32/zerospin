import { and, asc, eq, lte, sql, type Query } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { IAnyContracts } from '../contracts/types.ts';
import { compileSqliteTableDefinition } from '../drizzle/definition/compileSqliteTableDefinition.ts';
import { makeDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import type { IDb, ITx } from '../drizzle/types.ts';
import type { QuerySelection } from '../models/make/makeQueryDbVersion.ts';
import type { IEncodedResourceShape, IRef } from '../models/types.ts';
import {
  makeEncodedRowFromResource,
  makeResourceFromEncodedRow,
} from '../Node/resourceEnvelope.ts';

import type { IAgentRelease } from './AgentReleaseSchema.ts';
import {
  AgentViewStorageError,
  makeAgentStagingView,
} from './makeAgentStagingView.ts';
import { bindAgentQueryDb } from './makeAgentWake.ts';
import { pendingAgentWakesDbConfig } from './pendingAgentWakesDbConfig.ts';
import { runAgentWake, type IAgentStagedCommand } from './runAgentWake.ts';

const wakes = pendingAgentWakesDbConfig.schema.pendingAgentWakes;
type IPendingWake =
  typeof pendingAgentWakesDbConfig.tables.pendingAgentWakes.codec.Type;
export class AgentWakeDeadlineError extends Error {
  constructor(ruleName: string, resourceId: string, cause: unknown) {
    super(
      `Invalid wake deadline for ${ruleName} on ${resourceId}: ${String(cause)}`,
      { cause },
    );
  }
}

/** Confirmed selected rows and their derived deadlines advance atomically. */
export function makeAgentViewMaterialization<CONTRACTS extends IAnyContracts>(
  agent: IAgentRelease,
  ownerContracts: CONTRACTS,
) {
  const physicalTableNames = mapValues(
    agent.db.models,
    model => `__agent_view_${model.modelName}`,
  );
  const config = makeDbConfig({
    tables: mapValues(agent.db.models, model => model.table),
    physicalTableNames,
  });
  const definitions = Object.values(config.schema).map(table =>
    compileSqliteTableDefinition(table, { foreignKeys: false }),
  );
  const rules = Object.values(
    mapValues(agent.wakeRules, (rule, ruleName) => ({ rule, ruleName })),
  );

  function insertResource(tx: ITx, resource: IEncodedResourceShape) {
    const model = agent.db.models[resource.modelName];
    const table = config.schema[resource.modelName];
    if (model === undefined || table === undefined) {
      throw new Error('Agent view received an undeclared model');
    }
    const encoded = makeEncodedRowFromResource(resource, model);
    tx.insert(table).values(encoded).run();
  }

  function confirmedDeadlines(tx: ITx) {
    let confirmedRead: ReturnType<typeof read> | undefined = read(tx);
    const db = bindAgentQueryDb({
      modelsDb: agent.db,
      read(query) {
        if (confirmedRead === undefined)
          throw new Error('Agent wakeAt database is closed');
        return confirmedRead(query);
      },
    });
    try {
      const deadlines = new Map<string, Map<string, number>>();
      for (const { ruleName, rule } of rules) {
        const model = agent.db.models[rule.modelName]!;
        const table = config.schema[rule.modelName]!;
        const byResource = new Map<string, number>();
        for (const encoded of tx.select().from(table).all()) {
          const resource = makeResourceFromEncodedRow(encoded, model);
          try {
            const at = rule.wakeAt({ resource, db });
            if (at !== null) byResource.set(resource.id, at);
          } catch (cause) {
            if (cause instanceof AgentViewStorageError) throw cause;
            throw new AgentWakeDeadlineError(ruleName, resource.id, cause);
          }
        }
        deadlines.set(ruleName, byResource);
      }
      return deadlines;
    } finally {
      confirmedRead = undefined;
    }
  }

  function reconcileDeadlines(
    tx: ITx,
    previous: ReturnType<typeof confirmedDeadlines>,
  ) {
    // Compare calculated deadlines, including consumed occurrences which no longer have a pending row.
    for (const [ruleName, byResource] of confirmedDeadlines(tx)) {
      const before = previous.get(ruleName);
      if (before !== undefined) {
        for (const resourceId of before.keys()) {
          if (!byResource.has(resourceId)) {
            tx.delete(wakes)
              .where(
                and(
                  eq(wakes.ruleName, ruleName),
                  eq(wakes.resourceId, resourceId),
                ),
              )
              .run();
          }
        }
      }
      for (const [resourceId, at] of byResource) {
        if (before?.get(resourceId) !== at) {
          tx.insert(wakes)
            .values({ ruleName, resourceId, at })
            .onConflictDoUpdate({
              target: [wakes.ruleName, wakes.resourceId],
              set: { at },
            })
            .run();
        }
      }
    }
  }

  function install(tx: ITx, resources: readonly IEncodedResourceShape[]) {
    for (const table of definitions) {
      tx.run(sql.raw(table.createTable));
      for (const index of table.indexes) tx.run(sql.raw(index.sql));
    }
    for (const resource of resources) insertResource(tx, resource);
    reconcileDeadlines(tx, new Map());
  }

  function applyDelta(
    tx: ITx,
    delta: {
      upserted: readonly IEncodedResourceShape[];
      deleted: readonly IRef[];
    },
  ) {
    if (delta.upserted.length === 0 && delta.deleted.length === 0) return;
    const previous = confirmedDeadlines(tx);
    // Release every old unique value before installing the final rows; a command can swap two values.
    for (const ref of [...delta.deleted, ...delta.upserted]) {
      const table = config.schema[ref.modelName];
      if (table === undefined) {
        throw new Error('Agent delta contains an undeclared model');
      }
      tx.delete(table).where(eq(table.id!, ref.id)).run();
    }
    for (const next of delta.upserted) insertResource(tx, next);
    reconcileDeadlines(tx, previous);
  }

  function read(
    tx: ITx,
    options?: {
      physicalTableNames: Readonly<Record<string, string>>;
      bind(query: Query): Query;
    },
  ) {
    return <RESULT>(query: QuerySelection<RESULT>): RESULT => {
      const prepared = query.prepareRead({
        models: agent.db.models,
        physicalTableNames: options?.physicalTableNames ?? physicalTableNames,
      });
      try {
        const rows = tx._.session
          .prepareQuery(
            options?.bind(prepared.builtQuery) ?? prepared.builtQuery,
            'arrays',
            false,
            'all',
          )
          .all();
        return prepared.mapRows(
          Schema.decodeUnknownSync(Schema.Array(Schema.Array(Schema.Unknown)))(
            rows,
          ).map(row => [...row]),
        );
      } catch (cause) {
        throw new AgentViewStorageError(cause);
      }
    };
  }

  function dueWakes(db: IDb, now: number) {
    return db
      .select()
      .from(wakes)
      .where(lte(wakes.at, now))
      .orderBy(asc(wakes.at), asc(wakes.ruleName), asc(wakes.resourceId))
      .all();
  }

  const stagingView = makeAgentStagingView({
    agent,
    ownerContracts,
    physicalTableNames,
    read,
  });

  const consumeWake = Effect.fn('Agent.consumeWake')(function* (
    tx: ITx,
    scheduled: IPendingWake,
    staging: {
      aggregateId?: string | undefined;
      pending: readonly IAgentStagedCommand[];
      enqueue(
        tx: ITx,
        stage: IAgentStagedCommand,
      ): Effect.Effect<void, unknown>;
    },
  ) {
    const exact = and(
      eq(wakes.ruleName, scheduled.ruleName),
      eq(wakes.resourceId, scheduled.resourceId),
      eq(wakes.at, scheduled.at),
    );
    const consumed = tx
      .delete(wakes)
      .where(exact)
      .returning({ at: wakes.at })
      .all();
    if (consumed.length === 0) return;
    const rule = agent.wakeRules[scheduled.ruleName];
    if (!rule) throw new Error('Pending wake has no installed rule');
    yield* runAgentWake({
      tx,
      agent,
      ownerContracts,
      rule,
      scheduled,
      ...staging,
      view: stagingView,
    });
  });
  return { definitions, install, applyDelta, dueWakes, consumeWake };
}
