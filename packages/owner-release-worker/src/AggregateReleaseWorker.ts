import type { IAnyAggregateRelease } from '@zerospin/core/aggregate/types';
import { provideReleaseLayer } from '@zerospin/core/execution/provideReleaseLayer';
import { PREPARE_AGGREGATE_REPLAY_PATH } from '@zerospin/core/system/ownerReleaseDeployment';
import { AggregateActorVersionArchive } from '@zerospin/system-worker/AggregateActorVersionArchive/AggregateActorVersionArchive';
import { AggregateActorVersionChain } from '@zerospin/system-worker/AggregateActorVersionChain/AggregateActorVersionChain';
import { AggregateActorVersionRepo } from '@zerospin/system-worker/AggregateActorVersionRepo/AggregateActorVersionRepo';
import { authenticateAggregate } from '@zerospin/system-worker/AggregateApi/authenticate/authenticateAggregate/authenticateAggregate';
import {
  AggregateReplaySourceRequestSchema,
  prepareAggregateReplaySource,
} from '@zerospin/system-worker/aggregateReplayAdapter/prepareAggregateReplaySource';
import { AggregateVersionArchive } from '@zerospin/system-worker/AggregateVersionArchive/AggregateVersionArchive';
import { AggregateVersionChain } from '@zerospin/system-worker/AggregateVersionChain/AggregateVersionChain';
import {
  validateNativeAggregateActorSession,
  type IAggregateActorSessionAdmission,
} from '@zerospin/system-worker/ownerOperations/validateNativeActorSession';
import {
  AggregateAdmissionInputSchema,
  validateNativeAggregateAdmission,
} from '@zerospin/system-worker/ownerOperations/validateReleaseAdmission';
import { makeWorkerRpcEnvelope } from '@zerospin/system-worker/runWorkerInvocation/runWorkerInvocation';
import { deserialize } from 'capnweb';
import { WorkerEntrypoint } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { AggregateVersionRepo } from './AggregateVersionRepo/AggregateVersionRepo.js';
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

export type { IOwnerReleaseWorkerConfig } from './ownerReleaseRuntime.js';

const decodeReplayRequest = Schema.decodeUnknownSync(
  AggregateReplaySourceRequestSchema,
);

/** Bind the authored release to its Worker and Durable Object exports. */
export function makeAggregateReleaseWorker(
  release: IAnyAggregateRelease,
  config: IOwnerReleaseWorkerConfig,
): {
  AggregateReleaseWorker: new (
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
  AggregateVersionRepo: typeof AggregateVersionRepo;
  AggregateVersionChain: typeof AggregateVersionChain;
  AggregateVersionArchive: typeof AggregateVersionArchive;
  AggregateActorVersionRepo: typeof AggregateActorVersionRepo;
  AggregateActorVersionChain: typeof AggregateActorVersionChain;
  AggregateActorVersionArchive: typeof AggregateActorVersionArchive;
} {
  const expectedRelease = {
    aggregateName: release.name,
    aggregateVersion: release.version,
  };
  const runtime = configureOwnerReleaseRuntime(config, release);
  class AggregateReleaseWorker extends WorkerEntrypoint {
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
          if (pathname !== PREPARE_AGGREGATE_REPLAY_PATH) {
            return new Response(null, { status: 404 });
          }
          let input: ReturnType<typeof decodeReplayRequest>;
          try {
            input = decodeReplayRequest(deserialize(await request.text()), {
              onExcessProperty: 'error',
            });
          } catch {
            return Response.json(
              { code: 'aggregate-replay-adapter-request-invalid' },
              { status: 400 },
            );
          }
          return encodeReplayPreparation(
            prepareAggregateReplaySource(release, input),
            'aggregate-replay-adapter-source-failed',
          );
        },
      );
    }

    #requireRelease(key: {
      systemId: string;
      aggregateName: string;
      aggregateVersion: number;
    }) {
      if (
        readOwnerReleaseIdentity(config, expectedRelease) === undefined ||
        key.systemId !== config.systemId ||
        key.aggregateName !== release.name ||
        key.aggregateVersion !== release.version
      ) {
        throw new Error(
          'AggregateVersionRepo must belong to this System and owner release',
        );
      }
    }

    authenticateAggregateActor(
      systemId: string,
      props: Parameters<typeof authenticateAggregate>[0],
    ) {
      this.#requireRelease({ ...props, systemId });
      return runtime.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(
          provideReleaseLayer(release, authenticateAggregate(props)),
        ),
      );
    }

    validateAggregateActorSession(
      systemId: string,
      admission: IAggregateActorSessionAdmission,
    ) {
      this.#requireRelease({ ...admission, systemId });
      return runtime.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(validateNativeAggregateActorSession(admission)),
      );
    }

    validateAggregateAdmission(
      systemId: string,
      command: typeof AggregateAdmissionInputSchema.Type,
    ) {
      return runtime.managedRuntime.runPromise(
        makeWorkerRpcEnvelope(
          Effect.gen({ self: this }, function* () {
            const decoded = yield* Schema.decodeUnknownEffect(
              AggregateAdmissionInputSchema,
            )(command, { onExcessProperty: 'error' });
            this.#requireRelease({ ...decoded, systemId });
            yield* validateNativeAggregateAdmission(decoded, runtime.system);
          }),
        ),
      );
    }

    getAggregateVersionRepo(
      key: Parameters<typeof AggregateVersionRepo.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(AggregateVersionRepo.getRepo({ key }));
    }

    getAggregateVersionChain(
      key: Parameters<typeof AggregateVersionChain.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(AggregateVersionChain.getRepo({ key }));
    }

    getAggregateVersionArchive(
      key: Parameters<typeof AggregateVersionArchive.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(AggregateVersionArchive.getRepo({ key }));
    }

    getAggregateActorVersionRepo(
      key: Parameters<typeof AggregateActorVersionRepo.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(AggregateActorVersionRepo.getRepo({ key }));
    }

    getAggregateActorVersionChain(
      key: Parameters<typeof AggregateActorVersionChain.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(AggregateActorVersionChain.getRepo({ key }));
    }

    getAggregateActorVersionArchive(
      key: Parameters<typeof AggregateActorVersionArchive.getRepo>[0]['key'],
    ) {
      this.#requireRelease(key);
      return Effect.runSync(AggregateActorVersionArchive.getRepo({ key }));
    }
  }
  return {
    AggregateReleaseWorker,
    AggregateVersionRepo,
    AggregateVersionChain,
    AggregateVersionArchive,
    AggregateActorVersionRepo,
    AggregateActorVersionChain,
    AggregateActorVersionArchive,
  };
}
