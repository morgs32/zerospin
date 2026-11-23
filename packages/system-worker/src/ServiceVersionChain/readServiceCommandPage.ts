import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError } from '@zerospin/error';
import { and, asc, gt, lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';

import {
  decodeServiceEvaluatedCommandRow,
  type IEvaluatedServiceCommand,
} from './evaluatedServiceCommand.js';
import type { serviceVersionChainDbConfig } from './serviceVersionChainDbConfig.js';

type IServiceHistoryDbConfig = {
  schema: Pick<typeof serviceVersionChainDbConfig.schema, 'commands'>;
  tables: Pick<typeof serviceVersionChainDbConfig.tables, 'commands'>;
};

export const decodeServiceHistoryCommand = (
  dbConfig: IServiceHistoryDbConfig,
  row: typeof serviceVersionChainDbConfig.schema.commands.$inferSelect,
) =>
  Effect.runSync(
    dbConfig.tables.commands
      .decodeRow(row)
      .pipe(Effect.flatMap(decodeServiceEvaluatedCommandRow)),
  );

/** Bound encoded pages before loading the next row, allowing one larger valid command. */
export function readServiceCommandPage(props: {
  db: IDb;
  dbConfig: IServiceHistoryDbConfig;
  afterIndex: number;
  maxIndex: number;
}) {
  const { db, dbConfig, maxIndex } = props;
  const { commands } = dbConfig.schema;
  const rows: { index: number; row: IEvaluatedServiceCommand }[] = [];
  let afterIndex = props.afterIndex;
  let bytes = 0;
  while (rows.length < 64 && afterIndex < maxIndex) {
    const stored = db
      .select()
      .from(commands)
      .where(
        and(
          gt(commands.serviceIndex, afterIndex),
          lte(commands.serviceIndex, maxIndex),
        ),
      )
      .orderBy(asc(commands.serviceIndex))
      .limit(1)
      .get();
    if (stored === undefined || stored.serviceIndex !== afterIndex + 1) {
      throw makeZerospinError('service-version-archive-history-missing');
    }
    const row = decodeServiceHistoryCommand(dbConfig, stored);
    const rowBytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
    if (rows.length > 0 && bytes + rowBytes > 1_048_576) break;
    rows.push({ index: row.serviceIndex, row });
    afterIndex = row.serviceIndex;
    bytes += rowBytes;
  }
  return rows;
}
