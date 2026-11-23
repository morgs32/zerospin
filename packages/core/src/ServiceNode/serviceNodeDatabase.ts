import { makeMigratableNodeDatabase } from '../Node/makeMigratableNodeDatabase.ts';

import {
  serviceNodeCommands,
  serviceNodeMetadata,
} from './serviceNodeTables.ts';
import { publishedServiceNodeTables } from './storage/publishedServiceNodeTables.ts';

/** Append ordered { id, name, sql } steps here when the connected durable tables change. */
export const serviceNodeDatabase = makeMigratableNodeDatabase({
  baselineVersion: 22,
  tables: [serviceNodeMetadata, serviceNodeCommands],
  publishedBaselineTables: [
    publishedServiceNodeTables.metadata,
    publishedServiceNodeTables.commands,
  ],
  migrations: [],
});
