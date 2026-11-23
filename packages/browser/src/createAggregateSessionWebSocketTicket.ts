import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { decodeRpcOutcome } from '@zerospin/core/utils/decodeRpcOutcome';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import {
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type { GatewayApi } from '@zerospin/system-worker/GatewayApi/GatewayApi';
import * as Effect from 'effect/Effect';

export const createAggregateSessionWebSocketTicket = makeFn(
  'createAggregateSessionWebSocketTicket',
)(function* <
  AUTHENTICATION extends IResult<
    IAggregateAuthenticationRequest,
    IAnyError | IZerospinErrorJson
  >,
>(props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAuthenticationRequest(): Promise<AUTHENTICATION>;
  aggregateName: string;
  aggregateVersion: number;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
}) {
  const {
    aggregateSessionLock,
    aggregateName,
    apiUrl,
    sessionName,
    getAuthenticationRequest,
    publishableKey,
    systemName,
    aggregateVersion,
  } = props;
  if (aggregateSessionLock.origin.kind !== 'actor') {
    throw new Error('Application API requires an actor session lock');
  }
  const request = yield* Effect.promise(getAuthenticationRequest).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
  return yield* createAggregateSessionWebSocketTicketForAuthentication({
    apiUrl,
    publishableKey,
    systemName,
    aggregateName,
    aggregateVersion,
    sessionName,
    aggregateSessionLock,
    authentication: request,
  });
});

/** Select the actual session capability after its authentication request is already available. */
export const createAggregateSessionWebSocketTicketForAuthentication = makeFn(
  'createAggregateSessionWebSocketTicketForAuthentication',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  aggregateName: string;
  aggregateVersion: number;
  sessionName: string;
  aggregateSessionLock: IAggregateSessionLock;
  authentication: IAggregateAuthenticationRequest;
}) {
  const {
    apiUrl,
    publishableKey,
    systemName,
    aggregateName,
    aggregateVersion,
    sessionName,
    aggregateSessionLock,
    authentication: request,
  } = props;
  if (aggregateSessionLock.origin.kind !== 'actor') {
    throw new Error('Application API requires an actor session lock');
  }
  const actorOrigin = aggregateSessionLock.origin;
  const sessionApi = yield* getApi<GatewayApi>(apiUrl)(gatewayApi =>
    gatewayApi
      .aggregate({
        publishableKey,
        systemName,
        name: aggregateName,
        version: aggregateVersion,
        actorName: actorOrigin.actorName,
        actorVersion: actorOrigin.actorVersion,
      })
      .authenticate(request)
      .openSession({
        sessionName,
        aggregateSessionLock,
      }),
  );
  return yield* sessionApi.createWebSocketTicket();
});
