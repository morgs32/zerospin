import type { IDb } from '@zerospin/core/drizzle/types';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

import { consumeSessionWebSocketTicket } from '../sessionWebSocketTickets/consumeSessionWebSocketTicket.js';
import type { systemRepoDbConfig } from '../systemRepoDbConfig.js';

import { forwardSessionSocket } from './forwardSessionSocket.js';

const SocketPathSchema = Schema.Literals([
  '/ws-service-session-commands',
  '/ws-aggregate-session-commands',
]);
const TicketParamsSchema = Schema.Struct({
  ticket: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/u)),
});

/** Validate one socket route, spend its matching-family admission, then forward the retained owner. */
export const handleFetch = Effect.fn('SystemRepo.handleFetch', { root: true })(
  function* (props: {
    request: Request;
    db: IDb<typeof systemRepoDbConfig>;
    systemId: string;
    env: Cloudflare.Env;
  }) {
    const { request, db, systemId } = props;
    const url = new URL(request.url);
    if (
      request.method !== 'GET' ||
      !Schema.is(SocketPathSchema)(url.pathname)
    ) {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('upgrade') !== 'websocket') {
      return Response.json(
        { message: 'Expected WebSocket upgrade' },
        { status: 426 },
      );
    }
    const params = yield* Schema.decodeUnknownEffect(TicketParamsSchema)(
      Object.fromEntries(url.searchParams),
      { onExcessProperty: 'error' },
    ).pipe(Effect.result);
    if (
      url.searchParams.getAll('ticket').length !== 1 ||
      Result.isFailure(params)
    ) {
      return Response.json(
        { message: 'Missing or invalid WebSocket parameters' },
        { status: 400 },
      );
    }
    const admission = yield* consumeSessionWebSocketTicket({
      db,
      ticket: params.success.ticket,
      sessionFamily:
        url.pathname === '/ws-service-session-commands'
          ? 'service'
          : 'aggregate',
    }).pipe(Effect.result);
    if (Result.isFailure(admission)) {
      const invalid = admission.failure.code.endsWith(
        'websocket-ticket-invalid',
      );
      return Response.json(
        {
          message: invalid
            ? 'WebSocket ticket is invalid or expired'
            : 'Failed to admit WebSocket connection',
        },
        { status: invalid ? 401 : (admission.failure.status ?? 500) },
      );
    }
    return yield* forwardSessionSocket({
      request,
      systemId,
      admission: admission.success,
    });
  },
);
