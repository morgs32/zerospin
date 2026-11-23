import type {
  IAggregateAgentRelease,
  IAggregateAgentSessionInputs,
} from '@zerospin/core/agent/types';
import { AggregateAgentNode } from '@zerospin/core/AggregateAgentNode/AggregateAgentNode';
import { aggregateAgentNodeDbConfig } from '@zerospin/core/AggregateAgentNode/aggregateAgentNodeDbConfig';
import { makeResourceDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeInMemorySQLite3 } from '@zerospin/core/drizzle/make/makeInMemorySQLite3/makeInMemorySQLite3';
import { makeSqliteDrizzle } from '@zerospin/core/drizzle/make/makeSqliteDrizzle';
import { provisionDb } from '@zerospin/core/drizzle/provisionDb/provisionDb';
import type { ISessionExecution } from '@zerospin/core/sessionExecution/types';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

/** One scoped owner acquires the sole connection and closes it after synchronization stops. */
export function openAggregateAgentNode<
  RELEASE extends IAggregateAgentRelease,
>(props: {
  agentRelease: RELEASE;
  inputs: IAggregateAgentSessionInputs;
  execution: ISessionExecution<unknown>;
  signal: AbortSignal;
}) {
  return Effect.gen(function* () {
    const { agentRelease, inputs, execution, signal } = props;
    const sessionId = yield* Schema.decodeUnknownEffect(
      makeAbbreviationIdSchema('sesn'),
    )(`sesn_${crypto.randomUUID()}`);
    const client = yield* Effect.acquireRelease(
      Effect.promise(() => makeInMemorySQLite3(inputs.sqliteModuleFactory)),
      acquired => Effect.sync(() => acquired.sqlite3.close(acquired.db)),
    );
    if (signal.aborted) {
      return yield* Effect.interrupt;
    }
    const models: RELEASE['db']['models'] = agentRelease.db.models;
    const config = makeResourceDbConfig<
      RELEASE['db']['models'],
      typeof aggregateAgentNodeDbConfig.tables
    >({
      models,
      otherTables: aggregateAgentNodeDbConfig.tables,
    });
    const db = makeSqliteDrizzle(client, config);
    yield* provisionDb({ db, definition: config.definition });
    if (signal.aborted) {
      return yield* Effect.interrupt;
    }
    const node = new AggregateAgentNode({
      agentRelease,
      aggregateName: inputs.aggregateName,
      aggregateVersion: inputs.aggregateVersion,
      sessionId,
      db,
      runSync: execution.runSync,
      aggregateId: inputs.aggregateId,
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => node.dispose()));
    return node;
  });
}
