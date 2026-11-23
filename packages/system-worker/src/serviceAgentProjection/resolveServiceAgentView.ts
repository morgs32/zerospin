import { getServiceAgentRelease } from '@zerospin/core/agent/getAgentRelease';
import { VersionSchema } from '@zerospin/core/declaration/VersionSchema';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

export const ServiceAgentProjectionKeySchema = Schema.Struct({
  systemId: Schema.NonEmptyString,
  serviceName: Schema.NonEmptyString,
  serviceVersion: VersionSchema,
  agentName: Schema.NonEmptyString,
  agentVersion: VersionSchema,
});
export type IServiceAgentProjectionKey =
  typeof ServiceAgentProjectionKeySchema.Type;

/** Resolve the exact registered Agent and the Service release that owns its canonical model graph. */
export const resolveServiceAgentView = Effect.fn('resolveServiceAgentView')(
  function* (key: IServiceAgentProjectionKey) {
    const system = yield* System;
    const agent = getServiceAgentRelease(system, key);
    const serviceRelease = yield* getByKeyOrThrow({
      record: system.services[key.serviceName]?.releases ?? {},
      key: key.serviceVersion,
      recordKind: 'service versions',
    });
    if (
      serviceRelease.name !== key.serviceName ||
      serviceRelease.version !== key.serviceVersion
    ) {
      return yield* makeZerospinError('agent-version-owner-unavailable');
    }
    return { agent, serviceRelease };
  },
);
