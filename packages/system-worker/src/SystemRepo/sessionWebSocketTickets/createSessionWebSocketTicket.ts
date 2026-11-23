import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { mapParseError } from '@zerospin/error';
import { lte } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { requireAcceptedSystemSpec } from '../requireAcceptedSystemSpec.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { hashSessionTicket } from './hashSessionTicket.js';
import {
  sessionAdmissionFamily,
  SessionAdmissionSchema,
  type ISessionAdmission,
} from './SessionAdmissionSchema.js';
import { validateSessionAdmission } from './validateSessionAdmission.js';

const retainSessionTicketTx = makeTx('SystemRepo.retainSessionTicketTx')(
  function* (
    tx: ITx,
    props: {
      admission: ISessionAdmission;
      ticketHash: string;
      now: Date;
    },
  ) {
    const { admission, ticketHash, now } = props;
    const row =
      yield* systemRepoDbConfig.tables.sessionWebSocketTickets.encodeRow({
        ticketHash,
        sessionFamily: sessionAdmissionFamily(admission),
        admission,
        expiresAt: new Date(now.getTime() + 30_000),
      });
    const table = systemRepoDbConfig.schema.sessionWebSocketTickets;
    tx.delete(table).where(lte(table.expiresAt, now)).run();
    tx.insert(table).values(row).run();
  },
);

/** Validate one admission, generate a secret, then atomically retain only its hash for thirty seconds. */
export const createSessionWebSocketTicket = Effect.fn(
  'SystemRepo.createSessionWebSocketTicket',
)(function* (props: {
  db: IDb<typeof systemRepoDbConfig>;
  admission: ISessionAdmission;
}) {
  const { db, admission: inputAdmission } = props;
  const admission = yield* Schema.decodeUnknownEffect(SessionAdmissionSchema)(
    inputAdmission,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'session-websocket-admission-invalid',
      prefix: 'Invalid session admission',
    }),
  );
  const spec = yield* getSystemSpec();
  yield* requireAcceptedSystemSpec(db, spec.hash);
  yield* validateSessionAdmission(admission);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const ticket = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const ticketHash = yield* hashSessionTicket(ticket);
  yield* retainSessionTicketTx(db, {
    admission,
    ticketHash,
    now: new Date(),
  });
  return ticket;
});
