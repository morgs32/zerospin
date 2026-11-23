import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import type { aggregateVersionArchiveDbConfig } from '../AggregateVersionArchive/aggregateVersionArchiveDbConfig.js';

import {
  decodeAggregateEvaluatedCommandRow,
  type IEvaluatedAggregateCommand,
} from './evaluatedAggregateCommand.js';

type IAggregateHistoryDbConfig = {
  schema: Pick<typeof aggregateVersionArchiveDbConfig.schema, 'commands'>;
  tables: Pick<typeof aggregateVersionArchiveDbConfig.tables, 'commands'>;
};

export const decodeAggregateHistoryCommand = (
  dbConfig: IAggregateHistoryDbConfig,
  row: typeof aggregateVersionArchiveDbConfig.schema.commands.$inferSelect,
) =>
  Effect.runSync(
    dbConfig.tables.commands
      .decodeRow(row)
      .pipe(Effect.flatMap(decodeAggregateEvaluatedCommandRow)),
  );

export function readLocalAggregateHistoryCommand(
  dbConfig: IAggregateHistoryDbConfig,
  db: IDb,
  aggregateIndex: number,
) {
  const { commands } = dbConfig.schema;
  const row = db
    .select()
    .from(commands)
    .where(eq(commands.aggregateIndex, aggregateIndex))
    .get();
  return row === undefined
    ? null
    : decodeAggregateHistoryCommand(dbConfig, row);
}

/** Read bounded pages incrementally so one large command cannot multiply into a full-page allocation. */
export function readLocalAggregateHistoryPage(
  dbConfig: IAggregateHistoryDbConfig,
  db: IDb,
  page: { afterIndex: number; maxIndex?: number },
  lastIndex: number,
) {
  const { commands } = dbConfig.schema;
  const rows: { row: IEvaluatedAggregateCommand; index: number }[] = [];
  const maximum = Math.min(lastIndex, page.maxIndex ?? lastIndex);
  let afterIndex = page.afterIndex;
  let bytes = 0;
  while (rows.length < 64 && afterIndex < maximum) {
    const row = db
      .select()
      .from(commands)
      .where(
        and(
          gt(commands.aggregateIndex, afterIndex),
          lte(commands.aggregateIndex, maximum),
        ),
      )
      .orderBy(asc(commands.aggregateIndex))
      .limit(1)
      .get();
    if (row === undefined || row.aggregateIndex !== afterIndex + 1) {
      throw makeZerospinError('aggregate-history-missing');
    }
    const command = decodeAggregateHistoryCommand(dbConfig, row);
    const commandBytes = new TextEncoder().encode(
      JSON.stringify(command),
    ).byteLength;
    if (rows.length > 0 && bytes + commandBytes > 1024 * 1024) break;
    rows.push({ row: command, index: command.aggregateIndex });
    bytes += commandBytes;
    afterIndex = command.aggregateIndex;
  }
  return { rows, lastIndex };
}

export function readAggregateArchiveTip(
  dbConfig: IAggregateHistoryDbConfig,
  db: IDb,
  firstAggregateIndex: number,
) {
  const { commands } = dbConfig.schema;
  return (
    db
      .select({ aggregateIndex: commands.aggregateIndex })
      .from(commands)
      .orderBy(desc(commands.aggregateIndex))
      .limit(1)
      .get()?.aggregateIndex ?? firstAggregateIndex - 1
  );
}
