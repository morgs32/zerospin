import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { finalizeContractLineage } from '@zerospin/core/contracts/make/constructContractRelease';
import { makeReleaseSpec } from '@zerospin/core/declaration/makeReleaseSpec';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { System } from '@zerospin/core/system/System';
import type {
  ISystem,
  ISystemConfig,
  ISystemId,
  ITelemetryConfig,
} from '@zerospin/core/system/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { configureAuthoredWorker } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import { isEqual } from 'es-toolkit';

export type IOwnerReleaseWorkerConfig = {
  systemId: ISystemId;
  systemSpecHash: string;
  systemName: string;
  telemetry?: ITelemetryConfig;
};

export function configureOwnerReleaseRuntime(
  config: IOwnerReleaseWorkerConfig,
  release: IAnyAggregateRelease | IAnyServiceRelease,
  serviceBuilds?: ReadonlyMap<string, IAnyServiceRelease>,
) {
  for (const contract of Object.values(release.contracts)) {
    finalizeContractLineage(contract);
  }
  const system: ISystem = {
    name: config.systemName,
    aggregateAgents: {},
    serviceAgents: {},
    ...('guards' in release
      ? {
          aggregates: {
            [release.name]: { releases: { [release.version]: release } },
          },
          services: {},
        }
      : {
          aggregates: {},
          services: {
            [release.name]: {
              releases: { [release.version]: release },
              canonical: release.version,
            },
          },
        }),
  };
  if (serviceBuilds !== undefined) {
    if (serviceBuilds.size === 0) {
      throw new Error('A Service Worker must contain at least one build');
    }
    const expected = makeReleaseSpec(release);
    for (const [buildId, build] of serviceBuilds) {
      if (
        !buildId ||
        'guards' in release ||
        build.name !== release.name ||
        build.version !== release.version
      ) {
        throw new Error('Service build must belong to the configured release');
      }
      // External rows retain the source ID. Canonical adoption removes its local index lookup.
      if (Object.keys(build.external).length !== 0) {
        throw new Error('service-build-external-operations-unsupported');
      }
      for (const contract of Object.values(build.contracts)) {
        finalizeContractLineage(contract);
      }
      if (!isEqual(makeReleaseSpec(build), expected)) {
        throw new Error(
          'Service build declarations do not match the configured release',
        );
      }
    }
  }
  const services = Layer.mergeAll(
    Layer.succeed(System, system),
    NanoIdFactory,
    UlidMonotonicFactory,
  );
  const runtime: ISystemConfig = {
    system,
    systemId: config.systemId,
    managedRuntime: ManagedRuntime.make(
      Layer.effectContext(
        Layer.build(services).pipe(
          Effect.map(context => Context.makeUnsafe<unknown>(context.mapUnsafe)),
        ),
      ),
    ),
    ...(config.telemetry === undefined ? {} : { telemetry: config.telemetry }),
  };
  configureAuthoredWorker(runtime, config.systemSpecHash);
  return runtime;
}
