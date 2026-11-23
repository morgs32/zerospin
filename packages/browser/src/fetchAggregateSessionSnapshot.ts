import { AggregateSessionSnapshotSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/types';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { decodeRpcOutcome } from '@zerospin/core/utils/decodeRpcOutcome';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import {
  mapParseError,
  type IAnyError,
  type IResult,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { makeFn, type TelemetryCollector } from '@zerospin/logger';
import type { GatewayApi } from '@zerospin/system-worker/GatewayApi/GatewayApi';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

export const fetchAggregateSessionSnapshot = makeFn(
  'fetchAggregateSessionSnapshot',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAuthenticationRequest(): Promise<
    IResult<IAggregateAuthenticationRequest, IAnyError | IZerospinErrorJson>
  >;
  aggregateName: string;
  aggregateVersion: number;
  sessionName: string;
  nodeId: string | null;
  aggregateSessionLock: IAggregateSessionLock;
}): Effect.fn.Return<
  IAggregateSessionSnapshot,
  IAnyError | IZerospinErrorJson,
  TelemetryCollector
> {
  const {
    aggregateSessionLock,
    aggregateName,
    apiUrl,
    sessionName,
    getAuthenticationRequest,
    publishableKey,
    systemName,
    aggregateVersion,
    nodeId,
  } = props;
  if (aggregateSessionLock.origin.kind !== 'actor') {
    throw new Error('Application API requires an actor session lock');
  }
  const actorOrigin = aggregateSessionLock.origin;
  const authentication = yield* Effect.promise(getAuthenticationRequest).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
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
      .authenticate(authentication)
      .openSession({
        sessionName,
        aggregateSessionLock,
      }),
  );
  const snapshot = yield* sessionApi.getSnapshot({ nodeId });
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(AggregateSessionSnapshotSchema),
  )(snapshot).pipe(
    mapParseError({
      code: 'aggregate-session-snapshot-rpc-invalid',
      prefix: 'Invalid authenticated aggregate session snapshot',
    }),
  );
});
