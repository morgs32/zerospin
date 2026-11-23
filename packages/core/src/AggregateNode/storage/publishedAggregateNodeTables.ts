import { isNotNull } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import type { BrowserCommandSchema } from '../../contracts/BrowserCommandSchema.ts';
import type { ActorDeltaSchema } from '../../models/ActorDeltaSchema.ts';
import type {
  IAggregateNodeCommand,
  IAggregateNodeDefinition,
} from '../types.ts';

/** Shipped command tables retained for fixed-schema owners and published-source validation. */
export const aggregateNodeMetadata = sqliteTable('nodeMetadata', {
  nodeId: text().notNull(),
  aggregateId: text().notNull(),
  sessionKey: text().notNull(),
  admittedThroughPushIndex: integer().notNull(),
  aggregateIndex: integer(),
  dispositionChainHash: text(),
  pushPaused: integer({ mode: 'boolean' }).notNull(),
});
export const aggregateNodeCommands = sqliteTable(
  'commands',
  {
    nodeIndex: integer().primaryKey(),
    id: text().$type<`cmd_${string}`>(),
    sessionId: text().$type<`sesn_${string}`>(),
    sessionIndex: integer(),
    pushIndex: integer().unique(),
    commandName: text().notNull(),
    payload: text(),
    claims: text({ mode: 'json' }).$type<
      IAggregateNodeDefinition['identity']['claims']
    >(),
    stagingOutcome: text({ mode: 'json' }).$type<
      IAggregateNodeCommand['stagingOutcome']
    >(),
    failure: text({ mode: 'json' }).$type<
      Exclude<(typeof BrowserCommandSchema.Encoded)['failure'], null>
    >(),
    aggregateIndex: integer().unique(),
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
      .where(isNotNull(table.aggregateIndex)),
  ],
);

export const publishedAggregateNodeTables = {
  metadata: aggregateNodeMetadata,
  commands: aggregateNodeCommands,
};
