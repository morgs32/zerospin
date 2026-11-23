import type { Effect } from 'effect';

import { makeResourceDbConfig } from '../drizzle/make/makeDbConfig/makeDbConfig.ts';
import { makeInMemorySQLite3 } from '../drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3.ts';
import { makeSqliteDrizzle } from '../drizzle/make/makeSqliteDrizzle.ts';
import { makeTx } from '../drizzle/make/makeTx.ts';
import { provisionDb } from '../drizzle/provisionDb/provisionDb.ts';
import type { ISqliteClient, ITx } from '../drizzle/types.ts';
import type { IAnyModels, IEncodedResourceShape } from '../models/types.ts';

import { rebuildOptimisticResourcesTx } from './rebuildOptimisticResourcesTx.ts';
import { makeResourceFromEncodedRow } from './resourceEnvelope.ts';

export type INodeOptimisticView<COMMAND> = {
  project(
    resources: readonly IEncodedResourceShape[],
    commands: readonly COMMAND[],
  ): readonly IEncodedResourceShape[];
  close(): void;
};

/** One derived resource graph; durable original/final history remains on its Node. */
export async function makeNodeOptimisticView<COMMAND>(props: {
  models: IAnyModels;
  openMemory?: (() => Promise<ISqliteClient>) | undefined;
  runSync<A, E>(program: Effect.Effect<A, E, unknown>): A;
  replay(tx: ITx, command: COMMAND): Effect.Effect<unknown, unknown, unknown>;
}): Promise<INodeOptimisticView<COMMAND>> {
  const { models, runSync, replay, openMemory } = props;
  const client = await (openMemory ?? makeInMemorySQLite3)();
  try {
    const config = makeResourceDbConfig({ models });
    const db = makeSqliteDrizzle(client, config);
    runSync(provisionDb({ db, definition: config.definition }));
    const project = makeTx('rebuildNodeOptimisticView')(function* (
      tx: ITx,
      input: {
        resources: readonly IEncodedResourceShape[];
        commands: readonly COMMAND[];
      },
    ) {
      yield* rebuildOptimisticResourcesTx({
        tx,
        models,
        resources: input.resources,
        commands: input.commands,
        replay,
      });
      const resources: IEncodedResourceShape[] = [];
      for (const model of Object.values(models)) {
        for (const row of tx.select().from(model.drizzleSchema).all()) {
          resources.push(makeResourceFromEncodedRow(row, model));
        }
      }
      return resources;
    });
    let closed = false;
    return {
      project: (resources, commands) =>
        runSync(project(db, { resources, commands })),
      close: () => {
        if (!closed) {
          closed = true;
          client.sqlite3.close(client.db);
        }
      },
    };
  } catch (error) {
    client.sqlite3.close(client.db);
    throw error;
  }
}
