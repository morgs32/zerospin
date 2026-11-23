import { assertSessionClaims } from '@zerospin/core/identity/assertSessionClaims';
import type { IAggregateAuthenticationRequest } from '@zerospin/core/identity/types';
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

import { aggregateNodeNetwork } from './aggregateNodeNetwork.ts';
import type { IAggregateNodeRequest } from './aggregateNodeRequest.ts';
import { aggregateSessionDiscovery } from './aggregateSessionDiscovery.ts';
import { makeAggregateNodeBaseline } from './makeAggregateNodeBaseline.ts';
import { makeAggregateNodeDefinition } from './makeAggregateNodeDefinition.ts';
import type { IAggregateNodeResolution } from './verifiedAggregateAdmission.ts';

async function resolveRememberedAggregateNode(props: {
  request: IAggregateNodeRequest;
  aggregateId: string;
  expectedClaims: Readonly<Record<string, unknown>> | undefined;
  revision: number;
  signal: AbortSignal;
  backendFailure?: unknown;
}): Promise<IAggregateNodeResolution> {
  const {
    request,
    aggregateId,
    expectedClaims,
    revision,
    signal,
    backendFailure,
  } = props;
  if (expectedClaims === undefined) {
    throw makeZerospinError({ code: 'node-offline-claims-required' });
  }
  const remembered = await awaitConnectionStep(
    aggregateSessionDiscovery
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
  if (remembered.aggregateId !== aggregateId) {
    throw makeZerospinError('session-aggregate-selection-mismatch');
  }
  return {
    definition: await makeAggregateNodeDefinition(
      request,
      remembered.claims,
      remembered.aggregateId,
    ),
    request,
    revision,
    online: false,
  };
}

export async function resolveAggregateNode(props: {
  request: IAggregateNodeRequest;
  aggregateId: string;
  getAdmission(): Promise<IAggregateAuthenticationRequest>;
  expectedClaims?: Readonly<Record<string, unknown>> | undefined;
  revision: number;
  signal: AbortSignal;
}): Promise<IAggregateNodeResolution> {
  const {
    request,
    aggregateId,
    getAdmission,
    expectedClaims,
    revision,
    signal,
  } = props;
  if (isBrowserOffline()) {
    return resolveRememberedAggregateNode({
      request,
      aggregateId,
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
    return resolveRememberedAggregateNode({
      request,
      aggregateId,
      expectedClaims,
      revision,
      signal,
    });
  }
  if (admission.aggregateId !== aggregateId) {
    throw makeZerospinError('session-aggregate-selection-mismatch');
  }
  try {
    const snapshot = await waitForDevelopmentSystem(
      request.apiUrl,
      signal,
      () => aggregateNodeNetwork(request, admission).snapshot(null),
      { timeoutMs: 10_000 },
    );
    if (snapshot.aggregateId !== aggregateId) {
      throw makeZerospinError('session-aggregate-selection-mismatch');
    }
    assertSessionClaims(expectedClaims, snapshot.claims);
    const definition = await awaitConnectionStep(
      makeAggregateNodeDefinition(
        request,
        snapshot.claims,
        snapshot.aggregateId,
      ),
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
        snapshot: makeAggregateNodeBaseline(snapshot),
        getAdmission: () => awaitConnectionStep(getAdmission(), signal),
      },
    };
  } catch (error) {
    const unavailable =
      Schema.is(Schema.toType(NodeBackendTimeoutError))(error) ||
      Schema.is(Schema.toType(NodeBackendUnreachableError))(error);
    if (!unavailable) throw error;
    return resolveRememberedAggregateNode({
      request,
      aggregateId,
      expectedClaims,
      revision,
      signal,
      backendFailure: error,
    });
  }
}
