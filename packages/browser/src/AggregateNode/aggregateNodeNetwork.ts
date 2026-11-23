import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { isZerospinError, makeZerospinError } from '@zerospin/error';
import type { GatewayApi } from '@zerospin/system-worker/GatewayApi/GatewayApi';
import * as Effect from 'effect/Effect';

import { createAggregateSessionWebSocketTicketForAuthentication } from '../createAggregateSessionWebSocketTicket.ts';
import { fetchAggregateSessionSnapshot } from '../fetchAggregateSessionSnapshot.ts';
import { nodeNetworkProgram, runNodeNetwork } from '../Node/runNodeNetwork.ts';
import { isLocalNodeEndpoint } from '../Node/selectDevelopmentStorage.ts';

import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
export const aggregateNodeNetwork = (
  request: IAggregateNodeRequest,
  authentication: IAggregateAuthenticationRequest,
) => {
  const common = {
    ...request,
    getAuthenticationRequest: async () => ({
      _tag: 'Success' as const,
      success: authentication,
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
          if (request.lock.origin.kind !== 'actor') {
            return yield* makeZerospinError(
              'node-authentication-identity-mismatch',
            );
          }
          const origin = request.lock.origin;
          const sessionApi = yield* getApi<GatewayApi>(request.apiUrl)(
            gateway =>
              gateway
                .aggregate({
                  publishableKey: request.publishableKey,
                  systemName: request.systemName,
                  name: request.aggregateName,
                  version: request.aggregateVersion,
                  actorName: origin.actorName,
                  actorVersion: origin.actorVersion,
                })
                .authenticate(authentication)
                .openSession({
                  sessionName: request.sessionName,
                  aggregateSessionLock: request.lock,
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
        fetchAggregateSessionSnapshot({
          ...common,
          aggregateSessionLock: request.lock,
          nodeId,
        }),
        { endpoint: request.apiUrl, operation: 'getSnapshot' },
      );
      if (
        snapshot.aggregateName !== request.aggregateName ||
        snapshot.aggregateVersion !== request.aggregateVersion ||
        request.lock.origin.kind !== 'actor' ||
        snapshot.actorName !== request.lock.origin.actorName ||
        snapshot.actorVersion !== request.lock.origin.actorVersion ||
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
        createAggregateSessionWebSocketTicketForAuthentication({
          ...request,
          authentication,
          aggregateSessionLock: request.lock,
        }),
        { endpoint: request.apiUrl, operation: 'createWebSocketTicket' },
      ),
  };
};
