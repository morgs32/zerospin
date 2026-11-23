import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import {
  getOwnerReleaseBindingName,
  OwnerReleaseIdentitySchema,
  type IOwnerRelease,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import type { ISystemConfig, ISystemSpec } from '@zerospin/core/system/types';
import { NanoIdFactory } from '@zerospin/core/utils/NanoIdFactory';
import { UlidMonotonicFactory } from '@zerospin/core/utils/UlidMonotonicFactory';
import { env } from 'cloudflare:workers';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';

const decodeSystemSpec = Schema.decodeUnknownSync(SystemSpecSchema);
const decodeDeploymentData = Schema.decodeUnknownSync(
  Schema.Struct({
    spec: SystemSpecSchema,
    ownerReleases: Schema.Array(OwnerReleaseIdentitySchema),
  }),
);

/** Framework invocations have their own Effect services in every SystemWorker. */
export const frameworkWorkerRuntime = ManagedRuntime.make(
  Layer.mergeAll(NanoIdFactory, UlidMonotonicFactory),
);

let authoredConfig: ISystemConfig | undefined;
let registrationSpecHash: string | undefined;
let servingSpec: ISystemSpec | undefined;
let pinnedOwnerReleases: ReadonlyMap<string, IOwnerReleaseIdentity> = new Map();

/** Local co-location runs native declarations and framework code in one isolate. */
export function configureAuthoredWorker(
  config: ISystemConfig,
  acceptedSpecHash?: string,
) {
  authoredConfig = config;
  registrationSpecHash = acceptedSpecHash;
}

export function readAuthoredWorkerConfig() {
  return authoredConfig;
}

export function requireAuthoredWorkerConfig(): ISystemConfig {
  if (authoredConfig === undefined) {
    throw new Error('Worker does not have an authored release');
  }
  return authoredConfig;
}

/** Physical release namespaces resolve the configured release after module evaluation. */
export const authoredReleaseRepoRuntime = {
  get managedRuntime() {
    return requireAuthoredWorkerConfig().managedRuntime;
  },
  getConfiguredSystemId: () => requireAuthoredWorkerConfig().systemId,
  getSystemSpecHash: () =>
    registrationSpecHash ?? readExecutingSystemSpec().hash,
};

/** The CLI attaches one immutable text module to the serving Worker version. */
export function configureServingSystemSpec(text: string) {
  const { spec, ownerReleases } = decodeDeploymentData(JSON.parse(text), {
    onExcessProperty: 'error',
  });
  if (
    spec.systemName !== env.ZEROSPIN_SYSTEM_NAME ||
    spec.hash !== env.ZEROSPIN_SYSTEM_SPEC_HASH ||
    hashSystemSpec(spec) !== spec.hash
  ) {
    throw new Error(
      'SystemWorker deployment identity or SystemSpec hash does not match its snapshot',
    );
  }
  const pins = new Map<string, IOwnerReleaseIdentity>();
  for (const identity of ownerReleases) {
    const { release } = identity;
    const name = getOwnerReleaseBindingName(release);
    if (identity.systemId !== env.ZEROSPIN_SYSTEM_ID || pins.has(name)) {
      throw new Error(
        'SystemWorker deployment has an invalid owner release pin',
      );
    }
    pins.set(name, identity);
  }
  const declaredReleases = [
    ...Object.values(spec.aggregates).flatMap(owner =>
      Object.values(owner.releases).map(release => ({
        aggregateName: release.name,
        aggregateVersion: release.version,
      })),
    ),
    ...Object.values(spec.services).flatMap(owner =>
      Object.values(owner.releases).map(release => ({
        serviceName: release.name,
        serviceVersion: release.version,
      })),
    ),
  ];
  if (
    !env.ZEROSPIN_DEPLOYMENT_BOOTSTRAP &&
    declaredReleases.some(
      release => !pins.has(getOwnerReleaseBindingName(release)),
    )
  ) {
    throw new Error('SystemWorker deployment does not pin every owner release');
  }
  servingSpec = spec;
  pinnedOwnerReleases = pins;
}

export function listPinnedOwnerReleases() {
  return [...pinnedOwnerReleases.values()];
}

export function getPinnedOwnerRelease(release: IOwnerRelease) {
  return pinnedOwnerReleases.get(getOwnerReleaseBindingName(release));
}

export function readServingSystemSpec(): ISystemSpec | undefined {
  return servingSpec;
}

export function readExecutingSystemSpec(): ISystemSpec {
  if (servingSpec !== undefined) return servingSpec;
  if (registrationSpecHash !== undefined) {
    throw new Error('An owner release Worker has no whole-System declaration');
  }
  if (authoredConfig === undefined) {
    throw new Error('SystemWorker does not have a SystemSpec');
  }
  return decodeSystemSpec(makeSystemSpec({ system: authoredConfig.system }));
}

export function runWorkerPromise<A, E>(
  program: Effect.Effect<A, E, unknown>,
  options?: { readonly signal?: AbortSignal },
) {
  if (authoredConfig !== undefined) {
    return authoredConfig.managedRuntime.runPromise(program, options);
  }
  // The generated RPC constructor checks declared method requirements against
  // the repository and session Layers before the erased runner handles a request.
  return Effect.runPromise(
    frameworkWorkerRuntime.contextEffect.pipe(
      Effect.flatMap(services =>
        Effect.provideContext(
          program,
          Context.makeUnsafe<unknown>(services.mapUnsafe),
        ),
      ),
    ),
    options,
  );
}
