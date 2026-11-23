import { makeTx } from '@zerospin/core/drizzle/make/makeTx';
import type { IDb, ITx } from '@zerospin/core/drizzle/types';
import { ServiceAgentSessionLockSchema } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionLockSchema';
import type { IServiceAgentSessionSnapshot } from '@zerospin/core/serviceAgentSession/ServiceAgentSessionSnapshotSchema';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { ServiceAgentVersionChains } from '../repoServices/ServiceAgentVersionChains.js';
import { validateServiceAgentSessionLock } from '../serviceAgent/validateServiceAgentSessionLock.js';
import { genesisDispositionChainHash } from '../serviceDispositionChainHash/serviceDispositionChainHash.js';

import { readServiceAgentResources } from './readServiceAgentResources.js';
import {
  resolveServiceAgentView,
  type IServiceAgentProjectionKey,
} from './resolveServiceAgentView.js';
import { serviceAgentProjectionDbConfig } from './serviceAgentProjectionDbConfig.js';

const ServiceAgentSnapshotRequestSchema = Schema.Struct({
  serviceAgentSessionLock: ServiceAgentSessionLockSchema,
  sessionName: Schema.NonEmptyString,
  nodeId: Schema.NullOr(Schema.NonEmptyString),
});
export type IServiceAgentSnapshotRequest =
  typeof ServiceAgentSnapshotRequestSchema.Type;

/** Capture one resource/checkpoint pair, then verify only its exact durably published private prefix. */
export const captureServiceAgentSnapshot = Effect.fn(
  'ServiceAgentProjection.captureSnapshot',
)(function* (props: {
  db: IDb;
  key: IServiceAgentProjectionKey;
  request: IServiceAgentSnapshotRequest;
  publishThrough: (serviceIndex: number) => Effect.Effect<void, unknown>;
}) {
  const { key, db, publishThrough, request: inputRequest } = props;
  const request = yield* Schema.decodeUnknownEffect(
    ServiceAgentSnapshotRequestSchema,
  )(inputRequest, { onExcessProperty: 'error' }).pipe(
    mapParseError({
      code: 'agent-snapshot-request-invalid',
      prefix: 'Invalid Service Agent snapshot request',
    }),
  );
  const { agent } = yield* resolveServiceAgentView(key);
  yield* validateServiceAgentSessionLock({
    serviceName: key.serviceName,
    serviceVersion: key.serviceVersion,
    agentName: key.agentName,
    agentVersion: key.agentVersion,
    sessionName: request.sessionName,
    serviceAgentSessionLock: request.serviceAgentSessionLock,
  });
  const captured = yield* makeTx('ServiceAgentProjection.captureSnapshotTx')(
    function* (tx: ITx) {
      const table = serviceAgentProjectionDbConfig.schema.materializationHead;
      const head = tx
        .select()
        .from(table)
        .where(eq(table.singletonId, 1))
        .get();
      const resources = yield* readServiceAgentResources({
        db: tx,
        agent,
      });
      return {
        serviceIndex: head?.serviceIndex ?? 0,
        dispositionChainHash:
          head?.dispositionChainHash ?? genesisDispositionChainHash(),
        resources,
      };
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
  const history = yield* (yield* ServiceAgentVersionChains).getRepo({ key });
  const published = yield* Effect.promise(() =>
    history.getCheckpoint({ serviceIndex: captured.serviceIndex }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  if (
    published.serviceIndex !== captured.serviceIndex ||
    published.dispositionChainHash !== captured.dispositionChainHash
  ) {
    return yield* makeZerospinError('projection-history-checkpoint-conflict');
  }
  return {
    environment: env.ZEROSPIN_ENVIRONMENT,
    ...captured,
    serviceName: key.serviceName,
    serviceVersion: key.serviceVersion,
    agentName: key.agentName,
    agentVersion: key.agentVersion,
    sessionName: agent.sessionName,
  } satisfies IServiceAgentSessionSnapshot;
});
