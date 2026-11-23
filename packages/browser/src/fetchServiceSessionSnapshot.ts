import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { ServiceSessionSnapshotSchema } from '@zerospin/core/serviceSession/ServiceSessionWireSchema';
import type { IServiceSessionSnapshot } from '@zerospin/core/serviceSession/types';
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

export const fetchServiceSessionSnapshot = makeFn(
  'fetchServiceSessionSnapshot',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  serviceName: string;
  serviceVersion: number;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
  nodeId: string | null;
}): Effect.fn.Return<
  IServiceSessionSnapshot,
  IAnyError | IZerospinErrorJson,
  TelemetryCollector
> {
  const {
    apiUrl,
    sessionName,
    getAdmission,
    publishableKey,
    serviceSessionLock,
    serviceName,
    systemName,
    serviceVersion,
    nodeId,
  } = props;
  const request = yield* Effect.promise(getAdmission).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
  const sessionApi = yield* getApi<GatewayApi>(apiUrl)(gatewayApi =>
    gatewayApi
      .service({
        publishableKey,
        systemName,
        name: serviceName,
        version: serviceVersion,
      })
      .admit({
        ...request,
        actorName: serviceSessionLock.actorName,
        actorVersion: serviceSessionLock.actorVersion,
      })
      .authorize({
        sessionName,
        serviceSessionLock,
      }),
  );
  const snapshot = yield* sessionApi.getSnapshot({ nodeId });
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(ServiceSessionSnapshotSchema),
  )(snapshot).pipe(
    mapParseError({
      code: 'service-session-snapshot-rpc-invalid',
      prefix: 'Invalid authenticated service session snapshot',
    }),
  );
});
