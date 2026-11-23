import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import type { GatewayApi } from '@zerospin/system-worker/GatewayApi/GatewayApi';
import * as Effect from 'effect/Effect';

import { createServiceSessionWebSocketTicketForAdmission } from '../createServiceSessionWebSocketTicket.ts';
import { fetchServiceSessionSnapshot } from '../fetchServiceSessionSnapshot.ts';
import { nodeNetworkProgram, runNodeNetwork } from '../Node/runNodeNetwork.ts';
import { isLocalNodeEndpoint } from '../Node/selectDevelopmentStorage.ts';

import type { IServiceNodeRequest } from './serviceNodeRequest.ts';
export const serviceNodeNetwork = (
  request: IServiceNodeRequest,
  admission: IAdmissionRequest,
) => {
  const common = {
    ...request,
    getAdmission: async () => ({
      _tag: 'Success' as const,
      success: admission,
    }),
  };
  return {
    register: (
      nodeId: string,
      create: boolean,
      developmentHistoryId?: string,
    ) => {
      if (!isLocalNodeEndpoint(request.apiUrl)) {
        return Promise.resolve('not-local' as const);
      }
      return runNodeNetwork(
        Effect.gen(function* () {
          const sessionApi = yield* getApi<GatewayApi>(request.apiUrl)(
            gateway =>
              gateway
                .service({
                  publishableKey: request.publishableKey,
                  systemName: request.systemName,
                  name: request.serviceName,
                  version: request.serviceVersion,
                })
                .admit({
                  ...admission,
                  actorName: request.lock.actorName,
                  actorVersion: request.lock.actorVersion,
                })
                .authorize({
                  sessionName: request.sessionName,
                  serviceSessionLock: request.lock,
                }),
          );
          return yield* sessionApi.registerNode({
            nodeId,
            create,
            ...(developmentHistoryId === undefined
              ? {}
              : { developmentHistoryId }),
          });
        }),
        { endpoint: request.apiUrl, operation: 'registerNode' },
      ).catch(error => {
        if (
          isZerospinError(error) &&
          error.code === 'node-development-history-mismatch'
        ) {
          throw makeZerospinError({
            code: 'node-development-registration-stale',
            cause: error,
          });
        }
        throw error;
      });
    },
    snapshot: async (nodeId: string | null) => {
      const snapshot = await runNodeNetwork(
        fetchServiceSessionSnapshot({
          ...common,
          serviceSessionLock: request.lock,
          nodeId,
        }),
        { endpoint: request.apiUrl, operation: 'getSnapshot' },
      );
      if (
        snapshot.serviceName !== request.serviceName ||
        snapshot.serviceVersion !== request.serviceVersion ||
        snapshot.actorName !== request.lock.actorName ||
        snapshot.actorVersion !== request.lock.actorVersion ||
        snapshot.sessionName !== request.sessionName
      ) {
        throw makeZerospinError({
          code: 'node-authentication-identity-mismatch',
        });
      }
      return snapshot;
    },
    ticketProgram: () =>
      nodeNetworkProgram(
        createServiceSessionWebSocketTicketForAdmission({
          ...request,
          admission,
          serviceSessionLock: request.lock,
        }),
        { endpoint: request.apiUrl, operation: 'createWebSocketTicket' },
      ),
  };
};
