import { AggregateAgentSessionSnapshotSchema } from '@zerospin/core/agent/AggregateAgentSessionSnapshotSchema';
import { getAggregateAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import { AggregateSessionSnapshotSchema } from '@zerospin/core/aggregateSession/AggregateActorCommandSchema/AggregateActorCommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { readSelectedResources } from '@zerospin/core/models/reads/readSelectedResources';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { genesisDispositionChainHash } from '../../aggregateDispositionChainHash/aggregateDispositionChainHash.js';
import { AggregateActorVersionChains } from '../../repoServices/AggregateActorVersionChains.js';
import { AggregateAgentVersionChains } from '../../repoServices/AggregateAgentVersionChains.js';
import {
  aggregateAgentProjectionDbConfig,
  aggregateProjectionDbConfig,
} from '../aggregateProjectionDbConfig.js';
import {
  resolveAggregateProjectionView,
  type IAggregateProjectionKey,
} from '../resolveAggregateProjectionView.js';
import type {
  IAggregateActorProjectionSnapshotRequest,
  IAggregateAgentProjectionSnapshotRequest,
} from '../types.js';

import { readSelectedResourcesAndCheckpoint } from './readSelectedResourcesAndCheckpoint.js';

type ISnapshotProps = {
  db: IDb;
  publishExposedCommandsThrough: (
    aggregateIndex: number,
  ) => Effect.Effect<void, unknown>;
};

/** Actor snapshots include the producer's private completion prefix. */
export const getSnapshot = Effect.fn('AggregateProjection.getSnapshot')(
  function* (
    props: ISnapshotProps & {
      key: Extract<IAggregateProjectionKey, { actorName: string }>;
      requested: IAggregateActorProjectionSnapshotRequest;
    },
  ) {
    const { db, key, requested, publishExposedCommandsThrough } = props;
    if (
      requested.aggregateId !== key.aggregateId ||
      requested.aggregateName !== key.aggregateName ||
      requested.actorName !== key.actorName ||
      requested.actorVersion !== key.actorVersion
    ) {
      return yield* makeZerospinError({
        code: 'projection-state-owner-mismatch',
        message: 'State request does not match the bound view',
      });
    }

    const system = yield* System;
    const aggregateRegistry = yield* getByKeyOrThrow({
      record: system.aggregates,
      key: key.aggregateName,
      recordKind: 'aggregates',
    });
    const aggregateRelease = yield* getByKeyOrThrow({
      record: aggregateRegistry.releases,
      key: key.aggregateVersion,
      recordKind: 'listed versions',
    });
    const view = yield* resolveAggregateProjectionView({
      key,
      aggregateRelease,
    });
    if (
      !('claims' in requested) ||
      !Object.values(
        mapValues(
          view.encodedIdentity,
          (value, field) => requested.claims[field] === value,
        ),
      ).every(Boolean)
    ) {
      return yield* makeZerospinError('projection-state-identity-mismatch');
    }

    const { materializationHead } = aggregateProjectionDbConfig.schema;
    const { checkpoint, resources } = yield* readSelectedResourcesAndCheckpoint(
      Effect.sync(() => {
        const head = db
          .select()
          .from(materializationHead)
          .where(eq(materializationHead.singletonId, 1))
          .get();
        return {
          aggregateIndex: head?.aggregateIndex ?? 0,
          dispositionChainHash:
            head?.dispositionChainHash ?? genesisDispositionChainHash(),
        };
      }),
      () =>
        readSelectedResources({
          db,
          models: aggregateRelease.models,
          exposedModels: view.exposedModels,
          requireReferenceClosure: view.requireReferenceClosure,
          selections: view.selections,
          identity: view.selectionBindings,
        }),
    );

    yield* publishExposedCommandsThrough(checkpoint.aggregateIndex).pipe(
      Effect.mapError(error =>
        makeZerospinError({
          code: 'projection-history-publication-failed',
          cause: String(error),
        }),
      ),
    );
    const history = yield* (yield* AggregateActorVersionChains).getRepo({
      key,
    });
    const publishedCheckpoint = yield* Effect.promise(() =>
      history.getCheckpoint({ aggregateIndex: checkpoint.aggregateIndex }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    if (
      publishedCheckpoint.dispositionChainHash !==
      checkpoint.dispositionChainHash
    ) {
      return yield* makeZerospinError('projection-history-checkpoint-conflict');
    }

    const nodeId = requested.nodeId;
    const resolvedThrough =
      nodeId === null
        ? 0
        : yield* Effect.promise(() =>
            history.getResolvedThrough({
              nodeId,
              sessionName: requested.sessionName,
              actorName: requested.actorName,
              actorVersion: requested.actorVersion,
              claims: requested.claims,
              throughAggregateIndex: checkpoint.aggregateIndex,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(AggregateSessionSnapshotSchema),
    )({
      environment: env.ZEROSPIN_ENVIRONMENT,
      aggregateId: key.aggregateId,
      aggregateName: key.aggregateName,
      aggregateVersion: key.aggregateVersion,
      ...checkpoint,
      resources,
      sessionName: requested.sessionName,
      actorName: requested.actorName,
      actorVersion: requested.actorVersion,
      claims: requested.claims,
      resolvedThrough,
    }).pipe(
      mapParseError({
        code: 'projection-state-invalid',
        prefix: 'Invalid Actor snapshot',
      }),
    );
  },
);

/** Agent snapshots include the selected resources and their public checkpoint. */
export const getAgentSnapshot = Effect.fn(
  'AggregateProjection.getAgentSnapshot',
)(function* (
  props: ISnapshotProps & {
    key: Extract<IAggregateProjectionKey, { agentName: string }>;
    requested: IAggregateAgentProjectionSnapshotRequest;
  },
) {
  const { db, key, requested, publishExposedCommandsThrough } = props;
  if (
    requested.aggregateId !== key.aggregateId ||
    requested.aggregateName !== key.aggregateName ||
    !('origin' in requested) ||
    requested.origin.kind !== 'agent' ||
    requested.origin.agentName !== key.agentName ||
    requested.origin.agentVersion !== key.agentVersion
  ) {
    return yield* makeZerospinError({
      code: 'projection-state-owner-mismatch',
      message: 'State request does not match the bound view',
    });
  }
  const system = yield* System;
  const agent = getAggregateAgentRelease(system, key);
  if (agent.sessionName !== requested.sessionName) {
    return yield* makeZerospinError('agent-session-name-mismatch');
  }

  const { materializationHead } = aggregateAgentProjectionDbConfig.schema;
  const { checkpoint, resources } = yield* readSelectedResourcesAndCheckpoint(
    Effect.sync(() => {
      const head = db.select().from(materializationHead).get();
      return {
        aggregateIndex: head?.aggregateIndex ?? 0,
        dispositionChainHash:
          head?.dispositionChainHash ?? genesisDispositionChainHash(),
      };
    }),
    () =>
      readSelectedResources({
        db,
        models: agent.db.models,
        exposedModels: agent.db.models,
        selections: agent.selections,
        requireReferenceClosure: false,
      }),
  );

  yield* publishExposedCommandsThrough(checkpoint.aggregateIndex).pipe(
    Effect.mapError(error =>
      makeZerospinError({
        code: 'projection-history-publication-failed',
        cause: String(error),
      }),
    ),
  );
  const history = yield* (yield* AggregateAgentVersionChains).getRepo({ key });
  const publishedCheckpoint = yield* Effect.promise(() =>
    history.getCheckpoint({ aggregateIndex: checkpoint.aggregateIndex }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  if (
    publishedCheckpoint.dispositionChainHash !== checkpoint.dispositionChainHash
  ) {
    return yield* makeZerospinError('projection-history-checkpoint-conflict');
  }
  return yield* Schema.decodeUnknownEffect(
    Schema.toType(AggregateAgentSessionSnapshotSchema),
  )({
    environment: env.ZEROSPIN_ENVIRONMENT,
    aggregateId: key.aggregateId,
    aggregateName: key.aggregateName,
    aggregateVersion: key.aggregateVersion,
    aggregateIndex: checkpoint.aggregateIndex,
    dispositionChainHash: checkpoint.dispositionChainHash,
    resources,
    sessionName: requested.sessionName,
    origin: requested.origin,
  }).pipe(
    mapParseError({
      code: 'projection-state-invalid',
      prefix: 'Invalid Agent snapshot',
    }),
  );
});
