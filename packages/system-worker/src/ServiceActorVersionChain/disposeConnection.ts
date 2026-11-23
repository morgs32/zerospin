import type { IDb } from '@zerospin/core/drizzle/types';
import type { IServiceSocketServerMessage } from '@zerospin/core/serviceSession/ServiceSocketProtocolSchema';
import { eq } from 'drizzle-orm';
import type { Connection } from 'partyserver';

import { serviceActorVersionChainDbConfig } from './serviceActorVersionChainDbConfig.js';

/** Fence authority and attempt every teardown action even when a preceding action throws. */
export function disposeConnection(props: {
  db: IDb;
  connection: Pick<Connection, 'id' | 'setState' | 'send' | 'close'>;
  code?: number;
  reason?: string;
  message?: IServiceSocketServerMessage;
}): void {
  const { db, connection, code, reason, message } = props;
  try {
    connection.setState(null);
  } finally {
    try {
      if (message !== undefined) {
        connection.send(JSON.stringify(message));
      }
    } finally {
      try {
        if (code !== undefined) {
          connection.close(code, reason);
        }
      } finally {
        const table = serviceActorVersionChainDbConfig.schema.connectionLocks;
        db.delete(table).where(eq(table.connectionId, connection.id)).run();
      }
    }
  }
}
