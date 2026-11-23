import { getAggregateAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { System } from '@zerospin/core/system/System';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { resolveActorIdentity } from './resolveActorIdentity/resolveActorIdentity.js';

const aggregateKey = {
  systemId: Schema.NonEmptyString,
  aggregateId: Schema.NonEmptyString,
  aggregateName: Schema.NonEmptyString,
  aggregateVersion: VersionSchema,
};
export const AggregateProjectionKeySchema = Schema.Union([
  Schema.Struct({
    ...aggregateKey,
    actorName: Schema.NonEmptyString,
    actorVersion: VersionSchema,
    actorPath: Schema.NonEmptyString,
  }),
  Schema.Struct({
    ...aggregateKey,
    agentName: Schema.NonEmptyString,
    agentVersion: VersionSchema,
  }),
]);
export type IAggregateProjectionKey = Schema.Schema.Type<
  typeof AggregateProjectionKeySchema
>;

/** Resolve the selected Actor or Agent view under its exact owner release. */
export const resolveAggregateProjectionView = Effect.fn(
  'resolveAggregateProjectionView',
)(function* (props: {
  key: IAggregateProjectionKey;
  aggregateRelease: IAnyAggregateRelease;
}) {
  const { key, aggregateRelease } = props;
  const system = yield* System;
  if ('agentName' in key) {
    const agent = getAggregateAgentRelease(system, key);
    return {
      kind: 'agent' as const,
      exposedModels: agent.db.models,
      requireReferenceClosure: false,
      sessionName: agent.sessionName,
      selections: agent.selections,
      selectionBindings: {},
      encodedIdentity: {},
    };
  }
  const actor = yield* resolveAggregateActorVersion(
    { [aggregateRelease.version]: aggregateRelease },
    key,
  );
  const { selectionBindings, encodedIdentity } = yield* resolveActorIdentity({
    actor,
    actorPath: key.actorPath,
  });
  return {
    kind: 'actor' as const,
    exposedModels: actor.exposedModels,
    requireReferenceClosure: true,
    selections: actor.capturedSelections,
    selectionBindings,
    encodedIdentity,
  };
});
