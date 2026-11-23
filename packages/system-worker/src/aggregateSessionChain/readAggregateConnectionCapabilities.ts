import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import type { IDb } from '@zerospin/core/drizzle/types';
import { System } from '@zerospin/core/system/System';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { resolveActorIdentity } from '../aggregateProjection/resolveActorIdentity/resolveActorIdentity.js';
import type { IAggregateProjectionKey } from '../aggregateProjection/resolveAggregateProjectionView.js';

import { aggregateSessionChainDbConfig } from './aggregateSessionChainDbConfig.js';
import { makeConnectionCapabilities } from './connectionCapabilities.js';
import {
  AggregateActorSessionConnectionStateSchema,
  AggregateAgentSessionConnectionStateSchema,
} from './connectionState.js';
import { resolveAgentSessionContext } from './resolveAgentSessionContext.js';

/** Validate the attachment, then read Actor capabilities or derive the exact Agent's capabilities. */
export const readAggregateConnectionCapabilities = Effect.fn(
  'AggregateSessionChain.readAggregateConnectionCapabilities',
)(function* (props: {
  db: IDb;
  key: IAggregateProjectionKey;
  connectionId: string;
  admission: unknown;
}) {
  const { db, key, connectionId, admission: inputAdmission } = props;
  const decoded = yield* (
    'actorName' in key
      ? Schema.decodeUnknownEffect(
          Schema.toType(AggregateActorSessionConnectionStateSchema),
        )(inputAdmission, { onExcessProperty: 'error' })
      : Schema.decodeUnknownEffect(
          Schema.toType(AggregateAgentSessionConnectionStateSchema),
        )(inputAdmission, { onExcessProperty: 'error' })
  ).pipe(Effect.result);
  if (Result.isFailure(decoded)) return null;
  const admission = decoded.success;
  if (
    admission.aggregateId !== key.aggregateId ||
    admission.aggregateName !== key.aggregateName ||
    admission.aggregateVersion !== key.aggregateVersion
  ) {
    return null;
  }
  if ('actorName' in key) {
    return yield* Effect.gen(function* () {
      if (
        !('claims' in admission) ||
        (admission.phase !== 'awaiting-resume' &&
          admission.issuedNodeId !== null &&
          admission.nodeId !== admission.issuedNodeId)
      ) {
        return null;
      }
      const system = yield* System;
      const registry = Object.hasOwn(system.aggregates, key.aggregateName)
        ? system.aggregates[key.aggregateName]
        : undefined;
      const release =
        registry !== undefined &&
        Object.hasOwn(registry.releases, key.aggregateVersion)
          ? registry.releases[key.aggregateVersion]
          : undefined;
      if (release === undefined) return null;
      const actor = yield* resolveAggregateActorVersion(
        { [key.aggregateVersion]: release },
        key,
      );
      const { encodedIdentity } = yield* resolveActorIdentity({
        actor,
        actorPath: key.actorPath,
      });
      const claims = yield* Schema.decodeUnknownEffect(
        Schema.Record(Schema.String, Schema.Unknown),
      )(admission.claims);
      yield* Schema.decodeUnknownEffect(actor.identity.claimsSchema)(claims, {
        onExcessProperty: 'error',
      });
      if (
        !Object.values(
          mapValues(encodedIdentity, (value, field) => claims[field] === value),
        ).every(Boolean)
      ) {
        return null;
      }
      const table = aggregateSessionChainDbConfig.schema.connectionLocks;
      const retained = db
        .select()
        .from(table)
        .where(eq(table.connectionId, connectionId))
        .get();
      if (retained === undefined) return null;
      const capabilities =
        yield* aggregateSessionChainDbConfig.tables.connectionLocks.decodeRow(
          retained,
        );
      if (
        new Set(capabilities.modelNames).size !==
          capabilities.modelNames.length ||
        capabilities.modelNames.some(
          modelName => !Object.hasOwn(actor.exposedModels, modelName),
        )
      ) {
        return null;
      }
      const contractsAvailable = Object.values(
        mapValues(capabilities.contractVersions, (version, contractName) => {
          const contract = Object.hasOwn(actor.contracts, contractName)
            ? actor.contracts[contractName]
            : undefined;
          return (
            contract !== undefined &&
            contract.external === undefined &&
            contract.version === version
          );
        }),
      ).every(Boolean);
      if (!contractsAvailable) return null;
      return {
        modelNames: capabilities.modelNames,
        contractVersions: capabilities.contractVersions,
      };
    }).pipe(Effect.catchCause(() => Effect.succeed(null)));
  }
  const context = yield* resolveAgentSessionContext(key);
  if (
    context.sessionName !== admission.sessionName ||
    admission.issuedNodeId === null ||
    (admission.phase !== 'awaiting-resume' &&
      admission.nodeId !== admission.issuedNodeId)
  ) {
    return null;
  }
  return makeConnectionCapabilities(makeAggregateSessionLock(context.agent));
});
