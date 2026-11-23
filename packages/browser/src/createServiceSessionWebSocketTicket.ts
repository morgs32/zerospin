import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
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

export const createServiceSessionWebSocketTicket = makeFn(
  'createServiceSessionWebSocketTicket',
)(function* <
  ADMISSION extends IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>,
>(props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAdmission(): Promise<ADMISSION>;
  serviceName: string;
  serviceVersion: number;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}) {
  const {
    apiUrl,
    sessionName,
    getAdmission,
    publishableKey,
    serviceSessionLock,
    serviceName,
    systemName,
    serviceVersion,
  } = props;
  const request = yield* Effect.promise(getAdmission).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
  return yield* createServiceSessionWebSocketTicketForAdmission({
    apiUrl,
    publishableKey,
    systemName,
    serviceName,
    serviceVersion,
    sessionName,
    serviceSessionLock,
    admission: request,
  });
});

/** Select the actual session capability after its admission request is already available. */
export const createServiceSessionWebSocketTicketForAdmission = makeFn(
  'createServiceSessionWebSocketTicketForAdmission',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  serviceName: string;
  serviceVersion: number;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
  admission: IAdmissionRequest;
}) {
  const {
    apiUrl,
    publishableKey,
    systemName,
    serviceName,
    serviceVersion,
    sessionName,
    serviceSessionLock,
    admission: request,
  } = props;
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
  return yield* sessionApi.createWebSocketTicket({
    serviceVersion,
  });
});
