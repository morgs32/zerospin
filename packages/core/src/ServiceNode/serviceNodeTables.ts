import { isNotNull } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { BrowserCommandSchema } from '../contracts/BrowserCommandSchema.ts';
import type { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';

import type { publishedServiceNodeTables } from './storage/publishedServiceNodeTables.ts';
import type { IServiceNodeCommand } from './types.ts';

/** Current durable tables for the connected Node. */
export const serviceNodeMetadata = sqliteTable('nodeMetadata', {
  nodeId: text().notNull(),
  sessionKey: text().notNull(),
  admittedThroughPushIndex: integer().notNull(),
  serviceIndex: integer(),
  dispositionChainHash: text(),
  pushPaused: integer({ mode: 'boolean' }).notNull(),
});
export const serviceNodeCommands = sqliteTable(
  'commands',
  {
    nodeIndex: integer().primaryKey(),
    id: text().$type<`cmd_${string}`>(),
    sessionId: text().$type<`sesn_${string}`>(),
    sessionIndex: integer(),
    pushIndex: integer().unique(),
    commandName: text().notNull(),
    payload: text(),
    stagingOutcome: text({ mode: 'json' }).$type<
      IServiceNodeCommand['stagingOutcome']
    >(),
    failure: text({ mode: 'json' }).$type<
      Exclude<(typeof BrowserCommandSchema.Encoded)['failure'], null>
    >(),
    serviceIndex: integer().unique(),
    dispositionChainHash: text(),
    exposedDelta: text({ mode: 'json' }).$type<
      typeof ActorDeltaSchema.Encoded
    >(),
  },
  table => [
    uniqueIndex('commands_session_submission')
      .on(table.sessionId, table.sessionIndex)
      .where(isNotNull(table.pushIndex)),
    uniqueIndex('commands_final_id')
      .on(table.id)
      .where(isNotNull(table.serviceIndex)),
  ],
);

export const serviceNodeTables = {
  metadata: serviceNodeMetadata,
  commands: serviceNodeCommands,
};
export type IServiceNodeTables =
  | typeof serviceNodeTables
  | typeof publishedServiceNodeTables;
