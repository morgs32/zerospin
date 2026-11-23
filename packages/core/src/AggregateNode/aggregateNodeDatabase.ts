import { makeMigratableNodeDatabase } from '../Node/makeMigratableNodeDatabase.ts';

import {
  aggregateNodeCommands,
  aggregateNodeMetadata,
} from './aggregateNodeTables.ts';
import { publishedAggregateNodeTables } from './storage/publishedAggregateNodeTables.ts';

/** Append ordered { id, name, sql } steps here when the connected durable tables change. */
export const aggregateNodeDatabase = makeMigratableNodeDatabase({
  baselineVersion: 24,
  tables: [aggregateNodeMetadata, aggregateNodeCommands],
  publishedBaselineTables: [
    publishedAggregateNodeTables.metadata,
    publishedAggregateNodeTables.commands,
  ],
  migrations: [],
});
