import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { PREPARE_SERVICE_REPLAY_PATH } from '@zerospin/core/system/ownerReleaseDeployment';
import {
  validateNativeServiceActorSession,
  type IServiceActorSessionAdmission,
} from '@zerospin/system-worker/ownerOperations/validateNativeActorSession';
import {
  ServiceAdmissionInputSchema,
  validateNativeServiceAdmission,
} from '@zerospin/system-worker/ownerOperations/validateReleaseAdmission';
import { makeWorkerRpcEnvelope } from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import { ServiceActorVersionArchive } from '@zerospin/system-worker/ServiceActorVersionArchive/ServiceActorVersionArchive';
import { ServiceActorVersionChain } from '@zerospin/system-worker/ServiceActorVersionChain/ServiceActorVersionChain';
import { ServiceActorVersionRepo } from '@zerospin/system-worker/ServiceActorVersionRepo/ServiceActorVersionRepo';
import { admitService } from '@zerospin/system-worker/ServiceApi/admit/admitService/admitService';
import {
  prepareServiceReplaySource,
  ServiceReplaySourceRequestSchema,
} from '@zerospin/system-worker/serviceReplayAdapter/prepareServiceReplaySource';
import { ServiceVersionArchive } from '@zerospin/system-worker/ServiceVersionArchive/ServiceVersionArchive';
import { ServiceVersionChain } from '@zerospin/system-worker/ServiceVersionChain/ServiceVersionChain';
import { deserialize } from 'capnweb';
import { WorkerEntrypoint } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import {
  configureOwnerReleaseRuntime,
  type IOwnerReleaseWorkerConfig,
} from './ownerReleaseRuntime.js';
import {
  encodeReplayPreparation,
  handleOwnerReleaseRequest,
  readOwnerReleaseIdentity,
  readOwnerReleaseDeclaration,
} from './OwnerReleaseWorker.js';
import { ServiceVersionRepo } from './ServiceVersionRepo/ServiceVersionRepo.js';

export type { IOwnerReleaseWorkerConfig } from './ownerReleaseRuntime.js';

const decodeReplayRequest = Schema.decodeUnknownSync(
  ServiceReplaySourceRequestSchema,
);

/** Bind the authored release to its Worker and Durable Object exports. */
export function makeServiceReleaseWorker(
  release: IAnyServiceRelease,
  config: IOwnerReleaseWorkerConfig,
  builds?: Readonly<Record<string, IAnyServiceRelease>>,
): {
  ServiceReleaseWorker: new (
    ...args: ConstructorParameters<typeof WorkerEntrypoint<Cloudflare.Env>>
  ) => WorkerEntrypoint & {
    fetch(request: Request): Promise<Response>;
    getOwnerReleaseDeclaration(): ReturnType<
      typeof readOwnerReleaseDeclaration
    >;
    getOwnerReleaseIdentity(): NonNullable<
      ReturnType<typeof readOwnerReleaseIdentity>
    >;
  };
  ServiceVersionRepo: typeof ServiceVersionRepo;
  ServiceVersionChain: typeof ServiceVersionChain;
  ServiceVersionArchive: typeof ServiceVersionArchive;
  ServiceActorVersionRepo: typeof ServiceActorVersionRepo;
  ServiceActorVersionChain: typeof ServiceActorVersionChain;
  ServiceActorVersionArchive: typeof ServiceActorVersionArchive;
} {
  const expectedRelease = {
    serviceName: release.name,
    serviceVersion: release.version,
  };
  const availableBuilds =
    builds === undefined ? undefined : new Map(Object.entries(builds));
  const runtime = configureOwnerReleaseRuntime(
    config,
    release,
    availableBuilds,
  );
  class ServiceReleaseWorker extends WorkerEntrypoint {
    getOwnerReleaseIdentity() {
      const identity = readOwnerReleaseIdentity(config, expectedRelease);
      if (identity === undefined) {
        throw new Error('owner-release-worker-identity-invalid');
      }
      return identity;
    }

    getOwnerReleaseDeclaration() {
      return readOwnerReleaseDeclaration(
        this.getOwnerReleaseIdentity(),
        release,
      );
    }

    override fetch(request: Request) {
      return handleOwnerReleaseRequest(
        request,
        readOwnerReleaseIdentity(config, expectedRelease),
        release,
        runtime,
        async (request, pathname) => {
          if (pathname !== PREPARE_SERVICE_REPLAY_PATH) {
            return new Response(null, { status: 404 });
          }
          let input: ReturnType<typeof decodeReplayRequest>;
          try {
            input = decodeReplayRequest(deserialize(await request.text()), {
              onExcessProperty: 'error',
            });
          } catch {
            return Response.json(
              { code: 'service-replay-adapter-request-invalid' },
              { status: 400 },
            );
          }
          return encodeReplayPreparation(
            prepareServiceReplaySource(release, input),
            'service-replay-adapter-source-failed',
          );
        },
        availableBuilds,
      );
    }

    #requireRelease(key: {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
    }) {
      if (
        readOwnerReleaseIdentity(config, expectedRelease) === undefined ||
        key.systemId !== config.systemId ||
        key.serviceName !== release.name ||
        key.serviceVersion !== release.version
      ) {
        throw new Error(
          'ServiceVersionRepo must belong to this System and owner release',
        );
      }
    }

    authenticateServiceActor(
      systemId: string,
      props: Parameters<typeof admitService>[0],
    ) {
      this.#requireRelease({ ...props, systemId });
      return runtime.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(
          provideReleaseLayer(release, admitService(props)),
        ),
      );
    }

    validateServiceActorSession(
      systemId: string,
      admission: IServiceActorSessionAdmission,
    ) {
      this.#requireRelease({ ...admission, systemId });
      return runtime.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(validateNativeServiceActorSession(admission)),
      );
    }

    validateServiceAdmission(
      systemId: string,
      command: typeof ServiceAdmissionInputSchema.Type,
    ) {
      return runtime.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(
          Effect.gen({ self: this }, function* () {
            const decoded = yield* Schema.decodeUnknownEffect(
              ServiceAdmissionInputSchema,
            )(command, { onExcessProperty: 'error' });
            this.#requireRelease({ ...decoded, systemId });
            yield* validateNativeServiceAdmission(decoded, runtime.system);
          }),
        ),
      );
    }

    getServiceVersionRepo(
      key: Parameters<typeof ServiceVersionRepo.getRepo>[0]['key'],
    ): ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_VERSION_REPO']['getByName']
    > {
      this.#requireRelease(key);
      return Effect.runSync(ServiceVersionRepo.getRepo({ key }));
    }

    getServiceVersionChain(
      key: Parameters<typeof ServiceVersionChain.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(ServiceVersionChain.getRepo({ key }));
    }

    getServiceVersionArchive(
      key: Parameters<typeof ServiceVersionArchive.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(ServiceVersionArchive.getRepo({ key }));
    }

    getServiceActorVersionRepo(
      key: Parameters<typeof ServiceActorVersionRepo.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(ServiceActorVersionRepo.getRepo({ key }));
    }

    getServiceActorVersionChain(
      key: Parameters<typeof ServiceActorVersionChain.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(ServiceActorVersionChain.getRepo({ key }));
    }

    getServiceActorVersionArchive(
      key: Parameters<typeof ServiceActorVersionArchive.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(ServiceActorVersionArchive.getRepo({ key }));
    }
  }
  return {
    ServiceReleaseWorker,
    ServiceVersionRepo:
      availableBuilds === undefined
        ? ServiceVersionRepo
        : class extends ServiceVersionRepo {
            protected override readonly builds = availableBuilds;
          },
    ServiceVersionChain,
    ServiceVersionArchive,
    ServiceActorVersionRepo,
    ServiceActorVersionChain,
    ServiceActorVersionArchive,
  };
}
