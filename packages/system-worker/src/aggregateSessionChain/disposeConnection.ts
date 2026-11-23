import type { IDb } from '@zerospin/core/drizzle/types';
import { eq } from 'drizzle-orm';
import type { Connection } from 'partyserver';

import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

import { aggregateSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';

/** Fence attachment authority before close; reclaim Actor SQL even if either operation throws. */
export function disposeConnection(props: {
  db: IDb;
  key: IAggregateProjectionKey;
  connection: Pick<Connection, 'id' | 'close' | 'setState'>;
  code?: number;
  reason?: string;
}): void {
  const { key, connection, code, reason, db } = props;

  if ('agentName' in key) {
    try {
      connection.setState(null);
    } finally {
      if (code !== undefined) {
        connection.close(code, reason);
      }
    }
    return;
  }
  const table = aggregateSessionChainDbConfig.schema.connectionLocks;
  try {
    connection.setState(null);
  } finally {
    try {
      if (code !== undefined) connection.close(code, reason);
    } finally {
      db.delete(table).where(eq(table.connectionId, connection.id)).run();
    }
  }
}
