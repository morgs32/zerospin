import type { IDb } from '@zerospin/core/drizzle/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { and, eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { hashSessionTicket } from './hashSessionTicket.js';
import {
  sessionAdmissionFamily,
  type ISessionFamily,
} from './SessionAdmissionSchema.js';

/** Spend one matching-family credential before decoding or forwarding; every later failure leaves it burned. */
export const consumeSessionWebSocketTicket = Effect.fn(
  'SystemRepo.consumeSessionWebSocketTicket',
)(function* (props: {
  db: IDb;
  ticket: string;
  sessionFamily: ISessionFamily;
}) {
  const { sessionFamily, ticket, db } = props;

  const invalid = () =>
    makeZerospinError({
      code:
        sessionFamily === 'aggregate'
          ? 'aggregate-session-websocket-ticket-invalid'
          : 'service-session-websocket-ticket-invalid',
      message: 'Session WebSocket ticket is invalid or expired',
    });
  if (!/^[A-Za-z0-9_-]{43}$/u.test(ticket)) return yield* invalid();
  const ticketHash = yield* hashSessionTicket(ticket);
  const table = systemRepoDbConfig.schema.sessionWebSocketTickets;
  const row = db
    .delete(table)
    .where(
      and(
        eq(table.ticketHash, ticketHash),
        eq(table.sessionFamily, sessionFamily),
      ),
    )
    .returning()
    .get();
  if (row === undefined) return yield* invalid();
  const decodedSessionWebSocketTicket = yield* Schema.decodeUnknownEffect(
    systemRepoDbConfig.tables.sessionWebSocketTickets.codec,
  )(row, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'session-websocket-ticket-row-invalid',
      prefix: 'Invalid spent session admission',
    }),
  );
  if (
    sessionAdmissionFamily(decodedSessionWebSocketTicket.admission) !==
      decodedSessionWebSocketTicket.sessionFamily ||
    decodedSessionWebSocketTicket.expiresAt.getTime() <= Date.now()
  ) {
    return yield* invalid();
  }
  return decodedSessionWebSocketTicket.admission;
});
