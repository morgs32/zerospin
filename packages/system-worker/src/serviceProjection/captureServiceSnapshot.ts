import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { ServiceActorVersionChains } from '../repoServices/ServiceActorVersionChains.js';
import { validateServiceSessionLock } from '../ServiceAccessApi/authorize/authorizeServiceSession/validateServiceSessionLock/validateServiceSessionLock.js';
import { genesisDispositionChainHash } from '../serviceDispositionChainHash/serviceDispositionChainHash.js';

import { readServiceResources } from './readServiceResources.js';
import {
  resolveServiceActorView,
  type IServiceProjectionKey,
} from './resolveServiceActorView.js';
import { serviceProjectionDbConfig } from './serviceProjectionDbConfig.js';

export type IServiceSnapshotRequest = Readonly<{
  serviceSessionLock: IServiceSessionLock;
  claims: Readonly<Record<string, unknown>>;
  sessionName: string;
  nodeId: string | null;
}>;
/** Capture resources/checkpoint N locally, publish through N and recover only its exact private history prefix. */
export const captureServiceSnapshot = Effect.fn(
  'ServiceProjection.captureSnapshot',
)(function* (props: {
  db: IDb;
  key: IServiceProjectionKey;
  request: IServiceSnapshotRequest;
  publishThrough: (serviceIndex: number) => Effect.Effect<void, unknown>;
}) {
  const { key, db, request, publishThrough } = props;
  if (
    request.serviceSessionLock.actorName !== key.actorName ||
    request.serviceSessionLock.actorVersion !== key.actorVersion ||
    request.serviceSessionLock.sessionName !== request.sessionName
  ) {
    return yield* makeZerospinError('projection-state-identity-mismatch');
  }
  const admitted = yield* validateServiceSessionLock({
    serviceName: key.serviceName,
    serviceVersion: key.serviceVersion,
    sessionName: request.sessionName,
    serviceSessionLock: request.serviceSessionLock,
  });
  const system = yield* System;
  const release = yield* getByKeyOrThrow({
    record: system.services[key.serviceName]?.releases ?? {},
    key: key.serviceVersion,
    recordKind: 'service versions',
  });
  const { actor, encodedIdentity } = yield* resolveServiceActorView(
    release,
    key,
  );
  if (
    !Object.values(
      mapValues(
        encodedIdentity,
        (value, field) => request.claims[field] === value,
      ),
    ).every(Boolean)
  ) {
    return yield* makeZerospinError('projection-state-identity-mismatch');
  }
  yield* Schema.decodeUnknownEffect(actor.identity.claimsSchema)(
    request.claims,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'service-session-claims-invalid',
      prefix: 'Invalid admitted service claims',
    }),
  );
  const claims = request.claims;
  const captured = yield* makeTx('ServiceProjection.captureSnapshotTx')(
    function* (tx: ITx) {
      const table = serviceProjectionDbConfig.schema.materializationHead;
      const state = tx
        .select()
        .from(table)
        .where(eq(table.singletonId, 1))
        .get();
      const materializationHead = {
        serviceIndex: state?.serviceIndex ?? 0,
        dispositionChainHash:
          state?.dispositionChainHash ?? genesisDispositionChainHash(),
      };
      const resources = (yield* readServiceResources(tx, release, key)).filter(
        resource =>
          Object.hasOwn(admitted.serviceSessionLock.models, resource.modelName),
      );
      return { ...materializationHead, resources };
    },
  )(db);
  yield* publishThrough(captured.serviceIndex).pipe(
    Effect.mapError(error =>
      makeZerospinError({
        code: 'projection-history-publication-failed',
        cause: String(error),
      }),
    ),
  );
  const history = yield* (yield* ServiceActorVersionChains).getRepo({ key });
  const published = yield* Effect.promise(() =>
    history.getCheckpoint({ serviceIndex: captured.serviceIndex }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  if (
    published.serviceIndex !== captured.serviceIndex ||
    published.dispositionChainHash !== captured.dispositionChainHash
  ) {
    return yield* makeZerospinError('projection-history-checkpoint-conflict');
  }
  const resolvedThrough = yield* Effect.promise(() =>
    history.getResolvedThrough({
      owner: {
        actorName: key.actorName,
        actorVersion: key.actorVersion,
        nodeId: request.nodeId,
        claims,
        sessionName: request.sessionName,
      },
      afterOutcomeIndex: 0,
      throughServiceIndex: captured.serviceIndex,
    }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  return {
    environment: env.ZEROSPIN_ENVIRONMENT,
    ...captured,
    resolvedThrough,
    actorName: key.actorName,
    actorVersion: key.actorVersion,
    serviceName: key.serviceName,
    serviceVersion: key.serviceVersion,
    sessionName: request.sessionName,
    claims,
  };
});
