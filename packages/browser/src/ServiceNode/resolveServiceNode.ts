import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import * as Schema from 'effect/Schema';

import { awaitConnectionStep } from '../Node/awaitConnectionStep.ts';
import { isBrowserOffline } from '../Node/isBrowserOffline.ts';
import {
  NodeBackendTimeoutError,
  NodeBackendUnreachableError,
  NodeCredentialsTimeoutError,
} from '../Node/NodeErrors.ts';
import { localDevelopmentHistory } from '../Node/selectDevelopmentStorage.ts';
import { waitForDevelopmentSystem } from '../Node/waitForDevelopmentSystem.ts';

import { makeServiceNodeBaseline } from './makeServiceNodeBaseline.ts';
import { makeServiceNodeDefinition } from './makeServiceNodeDefinition.ts';
import { serviceNodeNetwork } from './serviceNodeNetwork.ts';
import type { IServiceNodeRequest } from './serviceNodeRequest.ts';
import { serviceSessionDiscovery } from './serviceSessionDiscovery.ts';
import type { IServiceNodeResolution } from './verifiedServiceAdmission.ts';

async function resolveRememberedServiceNode(props: {
  request: IServiceNodeRequest;
  expectedClaims: Readonly<Record<string, unknown>> | undefined;
  revision: number;
  signal: AbortSignal;
  backendFailure?: unknown;
}): Promise<IServiceNodeResolution> {
  const { request, expectedClaims, revision, signal, backendFailure } = props;
  if (expectedClaims === undefined) {
    throw makeZerospinError({ code: 'node-offline-claims-required' });
  }
  const remembered = await awaitConnectionStep(
    serviceSessionDiscovery
      .find(request, expectedClaims)
      .catch(discoveryError => {
        if (
          backendFailure === undefined ||
          !isZerospinError(discoveryError) ||
          discoveryError.code !== 'node-offline-identity-missing'
        ) {
          throw discoveryError;
        }
        throw makeZerospinError({
          code: discoveryError.code,
          message: discoveryError.message,
          status: discoveryError.status,
          extra: discoveryError.extra,
          cause: prettyUnknownFailure(backendFailure),
        });
      }),
    signal,
  );
  return {
    request,
    definition: await awaitConnectionStep(
      makeServiceNodeDefinition(request, remembered.claims),
      signal,
    ),
    revision,
    online: false,
  };
}

export async function resolveServiceNode(props: {
  request: IServiceNodeRequest;
  getAdmission(): Promise<IAdmissionRequest>;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  revision: number;
  signal: AbortSignal;
}): Promise<IServiceNodeResolution> {
  const { request, getAdmission, expectedClaims, revision, signal } = props;
  if (isBrowserOffline()) {
    return resolveRememberedServiceNode({
      request,
      expectedClaims,
      revision,
      signal,
    });
  }
  // Provider errors are not evidence that the server is unreachable.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const admission = await awaitConnectionStep(
    Promise.race([
      getAdmission(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              NodeCredentialsTimeoutError.make({ extra: { timeoutMs: 5000 } }),
            ),
          5000,
        );
      }),
    ]).finally(() => clearTimeout(timer)),
    signal,
  ).catch(error => {
    if (
      signal.aborted ||
      (!isBrowserOffline() &&
        !Schema.is(Schema.toType(NodeCredentialsTimeoutError))(error))
    ) {
      throw error;
    }
    return undefined;
  });
  if (admission === undefined) {
    return resolveRememberedServiceNode({
      request,
      expectedClaims,
      revision,
      signal,
    });
  }
  try {
    const snapshot = await waitForDevelopmentSystem(
      request.apiUrl,
      signal,
      () => serviceNodeNetwork(request, admission).snapshot(null),
      { timeoutMs: 10_000 },
    );
    assertSessionClaims(expectedClaims, snapshot.claims);
    const definition = await awaitConnectionStep(
      makeServiceNodeDefinition(request, snapshot.claims),
      signal,
    );
    return {
      request,
      definition,
      revision,
      online: true,
      verified: {
        identity: definition.identity,
        environment: snapshot.environment,
        developmentHistory: localDevelopmentHistory(request.apiUrl, snapshot),
        snapshot: makeServiceNodeBaseline(snapshot),
        admission,
      },
    };
  } catch (error) {
    const unavailable =
      Schema.is(Schema.toType(NodeBackendTimeoutError))(error) ||
      Schema.is(Schema.toType(NodeBackendUnreachableError))(error);
    if (!unavailable) throw error;
    return resolveRememberedServiceNode({
      request,
      expectedClaims,
      revision,
      signal,
      backendFailure: error,
    });
  }
}
