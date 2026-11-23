import fs from 'node:fs/promises';
import path from 'node:path';

import {
  getOwnerReleaseBindingName,
  getOwnerReleaseWorkerName,
  OWNER_RELEASE_BINDING_PREFIX,
  OwnerReleaseDeclarationSchema,
  OwnerReleaseIdentitySchema,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import {
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import type * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';
import { isEqual } from 'es-toolkit';

import type { ILoadedOwnerRelease } from '../loadOwnerReleaseSources.js';

import { bootstrapRecord } from './bootstrapRecord.js';
import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { openRemoteWorkerBinding } from './openRemoteWorkerBinding.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import {
  readWorkerVersion,
  type IWorkerVersionBinding,
} from './readWorkerVersionBindings.js';
import { publishWranglerWorkerVersion } from './runWranglerCommand.js';
import { hasServingWorkerVersion } from './stageSystemWorkerUpdate.js';
import {
  prepareOwnerReleaseWranglerConfig,
  readPredecessorRelease,
} from './writeOwnerReleaseEntrypoint.js';

export interface IServiceBinding {
  binding: string;
  service: string;
  environment?: string;
  entrypoint?: string;
}

const prepareOwnerReleaseWorker = makeFn('prepareOwnerReleaseWorker')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    loaded: ILoadedOwnerRelease,
    binding: IServiceBinding,
    predecessorBinding: IServiceBinding | undefined,
    accepted: IOwnerReleaseIdentity | undefined,
  ) {
    const { project } = workspace;
    const { release } = loaded;
    const { generatedConfig } = project;
    const systemId = generatedConfig.vars.ZEROSPIN_SYSTEM_ID;
    const configPath = path.join(
      workspace.directory,
      `${binding.service}.json`,
    );
    yield* Effect.tryPromise({
      try: async () => {
        const config = await prepareOwnerReleaseWranglerConfig({
          ...loaded,
          directory: workspace.directory,
          frameworkMain:
            'aggregateName' in release
              ? project.aggregateReleaseWorkerMain
              : project.serviceReleaseWorkerMain,
          stable: generatedConfig,
          config: { systemId, wrangler: project.applicationBindings },
        });
        const services =
          predecessorBinding === undefined
            ? config.services
            : [...config.services, predecessorBinding];
        await fs.writeFile(
          configPath,
          JSON.stringify({ ...config, services }),
          {
            mode: 0o600,
          },
        );
      },
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-wrangler-temp-files-write-failed',
          message: `Failed to prepare deployment files for ${binding.service}.`,
          cause: prettyUnknownFailure(cause),
        }),
    });
    const ownerWorkspace = { ...workspace, configPath };
    const accountId = workspace.environment['CLOUDFLARE_ACCOUNT_ID'];
    if (!accountId) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-account-unknown',
        message:
          'Cloudflare account is required to reconcile owner Worker uploads.',
      });
    }
    const record = bootstrapRecord(workspace, accountId, binding.service);
    const pending = yield* record.read;
    if (pending && !pending.owner) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-upload-pending',
        message:
          'Pending upload for owner Worker ' +
          binding.service +
          ' is missing its owner declaration. Recovery record ' +
          record.file +
          '.',
      });
    }
    const observed = yield* readWorkerDeployment(ownerWorkspace);
    const versionId = observed.deployment?.versions[0]?.version_id;
    const uploadPending = () =>
      makeZerospinError({
        code: 'zerospin-owner-release-upload-pending',
        message:
          'Cloudflare has not confirmed the last upload of ' +
          binding.service +
          '. Recovery record ' +
          record.file +
          '.',
      });
    const verifyExecutingOwner = Effect.fn('verifyExecutingOwner')(function* (
      expectedVersion: string,
      owner?: {
        specHash: string;
        releaseSpec: ILoadedOwnerRelease['releaseSpec'];
      },
    ) {
      const url = yield* openRemoteWorkerBinding(ownerWorkspace, {
        service: binding.service,
        ownerRpc: owner
          ? 'getOwnerReleaseDeclaration'
          : 'getOwnerReleaseIdentity',
      }).pipe(
        Effect.mapError(cause =>
          makeZerospinError({
            code: 'zerospin-owner-release-deployment-unverified',
            message: 'Could not open the binding to ' + binding.service + '.',
            cause: prettyUnknownFailure(cause),
          }),
        ),
      );
      const observed = yield* Effect.tryPromise({
        try: async signal => {
          const response = await fetch(url, { signal });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(
              'Owner Worker returned HTTP ' + response.status + '.',
            );
          }
          const body: unknown = await response.json();
          return owner
            ? Schema.decodeUnknownSync(OwnerReleaseDeclarationSchema)(body, {
                onExcessProperty: 'error',
              })
            : {
                identity: Schema.decodeUnknownSync(OwnerReleaseIdentitySchema)(
                  body,
                  { onExcessProperty: 'error' },
                ),
                releaseSpec: undefined,
              };
        },
        catch: cause =>
          makeZerospinError({
            code: 'zerospin-owner-release-deployment-unverified',
            message:
              'Could not verify owner Worker ' +
              binding.service +
              ' version ' +
              expectedVersion +
              '.',
            cause: prettyUnknownFailure(cause),
          }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: '35 seconds',
          orElse: () =>
            Effect.fail(
              makeZerospinError({
                code: 'zerospin-owner-release-deployment-unverified',
                message:
                  'Timed out waiting for ' +
                  binding.service +
                  ' version ' +
                  expectedVersion +
                  '.',
              }),
            ),
        }),
      );
      const pin = observed.identity;
      if (
        pin.systemId !== systemId ||
        pin.versionId !== expectedVersion ||
        !isEqual(pin.release, release) ||
        (owner !== undefined && owner.specHash !== pin.specHash) ||
        (accepted !== undefined && !isEqual(accepted, pin))
      ) {
        return yield* makeZerospinError({
          code: 'zerospin-owner-release-deployment-unverified',
          message:
            'The answering executable does not match the expected pin for ' +
            binding.service +
            ' version ' +
            expectedVersion +
            '.',
        });
      }
      if (owner && !isEqual(owner.releaseSpec, observed.releaseSpec)) {
        // The identified build answered definitively. A later deploy may publish corrected code.
        yield* record.clear;
        return yield* makeZerospinError({
          code: 'zerospin-owner-release-declaration-mismatch',
          message:
            'The executing declaration differs from the registered release ' +
            JSON.stringify(release) +
            ' for Worker ' +
            binding.service +
            ' version ' +
            expectedVersion +
            '.',
        });
      }
      return pin;
    });
    if (!observed.workerAbsent) {
      if (
        !versionId ||
        !hasServingWorkerVersion(observed.deployment, versionId)
      ) {
        if (pending) return yield* uploadPending();
        return yield* makeZerospinError({
          code: 'zerospin-owner-release-deployment-unverified',
          message:
            'Could not identify one serving version for owner Worker ' +
            binding.service +
            '.',
        });
      }
      if (pending) {
        const version = yield* readWorkerVersion(ownerWorkspace, versionId);
        if (version.annotations?.['workers/tag'] !== pending.runId) {
          return yield* uploadPending();
        }
      }
      const identity = yield* verifyExecutingOwner(versionId, pending?.owner);
      if (pending) yield* record.clear;
      if (accepted) return Effect.succeed(identity);
    } else if (pending) {
      return yield* uploadPending();
    } else if (accepted) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-deployment-unverified',
        message:
          'Cloudflare is missing accepted owner Worker version ' +
          accepted.versionId +
          ' for ' +
          binding.service +
          '.',
      });
    }
    return Effect.gen(function* () {
      const latest = yield* readWorkerDeployment(ownerWorkspace);
      if (
        latest.workerAbsent !== observed.workerAbsent ||
        latest.deployment?.id !== observed.deployment?.id
      ) {
        return yield* makeZerospinError({
          code: 'zerospin-owner-release-deployment-unverified',
          message:
            'Cloudflare changed the owner Worker deployment for ' +
            binding.service +
            '.',
        });
      }
      const args = ['deploy', '--tag', workspace.runId];
      if (workspace.ownerTelemetrySecretsPath !== undefined) {
        args.push('--secrets-file', workspace.ownerTelemetrySecretsPath);
      }
      const owner = {
        specHash: project.systemSpec.hash,
        releaseSpec: loaded.releaseSpec,
      };
      yield* record.write({ runId: workspace.runId, systemId, owner });
      const versionId = yield* publishWranglerWorkerVersion(
        ownerWorkspace,
        args,
        { workerName: binding.service, recordType: 'deploy' },
      );
      const current = (yield* readWorkerDeployment(ownerWorkspace)).deployment;
      if (
        !hasServingWorkerVersion(current, versionId) ||
        current?.id === observed.deployment?.id
      ) {
        return yield* uploadPending();
      }
      const identity = yield* verifyExecutingOwner(versionId, owner);
      const confirmed = (yield* readWorkerDeployment(ownerWorkspace))
        .deployment;
      if (
        confirmed?.id !== current?.id ||
        !hasServingWorkerVersion(confirmed, versionId)
      ) {
        return yield* uploadPending();
      }
      yield* record.clear;
      return identity;
    });
  },
);

function requireSystemNamespaces(
  bindings: readonly IWorkerVersionBinding[],
  workerName: string,
) {
  return Effect.forEach(
    [
      { name: 'SYSTEM_REPO', className: 'SystemRepo' },
      { name: 'AGGREGATE_CHAIN', className: 'AggregateChain' },
      { name: 'SERVICE_CHAIN', className: 'ServiceChain' },
    ],
    ({ name, className }) => {
      const binding = bindings.find(
        binding =>
          binding.type === 'durable_object_namespace' && binding.name === name,
      );
      if (
        !binding?.namespace_id ||
        binding.class_name !== className ||
        (binding.script_name ?? workerName) !== workerName
      ) {
        return Effect.fail(
          makeZerospinError({
            code: 'zerospin-chain-namespace-unverified',
            message:
              'Could not verify the local Durable Object namespace for ' +
              name +
              '.',
          }),
        );
      }
      return Effect.succeed({ name, namespaceId: binding.namespace_id });
    },
  );
}

/** Add bindings against the exact live version the CLI will use to stage its candidate. */
export const prepareOwnerReleaseBindings = makeFn(
  'prepareOwnerReleaseBindings',
)(function* (
  workspace: IWranglerDeploymentWorkspace,
  originalBindings: readonly IWorkerVersionBinding[],
  acceptedPins: ReadonlyMap<string, IOwnerReleaseIdentity>,
) {
  if (
    !originalBindings.some(
      binding =>
        binding.name === 'ZEROSPIN_STORAGE_LAYOUT' &&
        binding.text === 'release-owned-v1',
    ) ||
    originalBindings.some(
      binding =>
        binding.type === 'durable_object_namespace' &&
        /_(?:ACTOR_)?VERSION_(?:REPO|CHAIN|ARCHIVE)$/.test(binding.name) &&
        !binding.name.includes('_AGENT_'),
    )
  ) {
    return yield* makeZerospinError({
      code: 'zerospin-release-layout-incompatible',
      message:
        'The deployed SystemWorker owns release history or projections. The new layout requires a fresh System.',
    });
  }
  const workerName = workspace.project.generatedConfig.name;
  const originalNamespaces = yield* requireSystemNamespaces(
    originalBindings,
    workerName,
  );
  const releaseBindings = new Map<string, IServiceBinding>();
  for (const binding of originalBindings) {
    if (!binding.name.startsWith(OWNER_RELEASE_BINDING_PREFIX)) continue;
    if (
      binding.type !== 'service' ||
      !binding.service ||
      releaseBindings.has(binding.name)
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-wrangler-binding-conflict',
        message: `Live Worker binding "${binding.name}" does not identify one owner Worker service.`,
      });
    }
    releaseBindings.set(binding.name, {
      binding: binding.name,
      service: binding.service,
      ...(binding.environment === undefined
        ? {}
        : { environment: binding.environment }),
      ...(binding.entrypoint === undefined
        ? {}
        : { entrypoint: binding.entrypoint }),
    });
  }

  const { generatedConfig, ownerReleases } = workspace.project;
  const unregistered: {
    loaded: ILoadedOwnerRelease;
    binding: IServiceBinding;
  }[] = [];
  for (const loaded of ownerReleases) {
    const { release } = loaded;
    const name = getOwnerReleaseBindingName(release);
    const service = getOwnerReleaseWorkerName(generatedConfig.name, release);
    const existing = releaseBindings.get(name);
    if (existing === undefined) {
      const binding = { binding: name, service };
      releaseBindings.set(name, binding);
      unregistered.push({ loaded, binding });
    } else if (
      existing.service !== service ||
      (existing.environment ?? 'production') !== 'production' ||
      (existing.entrypoint ?? 'default') !== 'default'
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-wrangler-binding-conflict',
        message: `Live Worker binding "${name}" already refers to a different owner Worker.`,
      });
    }
  }

  const batches: Array<
    Array<Effect.Success<ReturnType<typeof prepareOwnerReleaseWorker>>>
  > = [];
  const batchByBinding = new Map<string, number>();
  for (const { loaded, binding } of unregistered.toSorted(
    ({ loaded: { release: left } }, { loaded: { release: right } }) =>
      ('aggregateVersion' in left
        ? left.aggregateVersion
        : left.serviceVersion) -
      ('aggregateVersion' in right
        ? right.aggregateVersion
        : right.serviceVersion),
  )) {
    const predecessor = readPredecessorRelease(
      workspace.project.systemSpec,
      loaded.release,
    );
    const predecessorBinding =
      predecessor === undefined
        ? undefined
        : releaseBindings.get(getOwnerReleaseBindingName(predecessor));
    if (predecessor !== undefined && predecessorBinding === undefined) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-binding-missing',
        message: `Could not bind the predecessor of owner Worker ${binding.service}.`,
      });
    }
    const publication = yield* prepareOwnerReleaseWorker(
      workspace,
      loaded,
      binding,
      predecessorBinding,
      acceptedPins.get(binding.binding),
    );
    const predecessorBatch =
      predecessorBinding === undefined
        ? undefined
        : batchByBinding.get(predecessorBinding.binding);
    const batch = predecessorBatch === undefined ? 0 : predecessorBatch + 1;
    (batches[batch] ??= []).push(publication);
    batchByBinding.set(binding.binding, batch);
  }

  const publishOwnerReleases = Effect.fn('publishOwnerReleases')(function* () {
    const pins: IOwnerReleaseIdentity[] = [];
    for (const jobs of batches) {
      let firstFailure: Cause.Cause<IAnyError> | undefined;
      const exits = yield* Effect.forEach(
        jobs,
        job =>
          Effect.suspend(() =>
            firstFailure === undefined
              ? Effect.matchCause(job, {
                  onSuccess: Exit.succeed,
                  onFailure: cause => {
                    firstFailure ??= cause;
                    return Exit.failCause(cause);
                  },
                })
              : Effect.succeed<Exit.Exit<IOwnerReleaseIdentity, IAnyError>>(
                  Exit.failCause(firstFailure),
                ),
          ),
        { concurrency: 4 },
      );
      if (firstFailure !== undefined) {
        return yield* Effect.failCause(firstFailure);
      }
      pins.push(...(yield* Effect.all(exits)));
    }
    return pins;
  });

  const verifyCandidateBindings = Effect.fn('verifyCandidateBindings')(
    function* (candidateBindings: readonly IWorkerVersionBinding[]) {
      const candidateNamespaces = yield* requireSystemNamespaces(
        candidateBindings,
        workerName,
      );
      for (const original of originalNamespaces) {
        const candidate = candidateNamespaces.find(
          namespace => namespace.name === original.name,
        );
        if (candidate?.namespaceId !== original.namespaceId) {
          return yield* makeZerospinError({
            code: 'zerospin-chain-namespace-changed',
            message: `The stable candidate changes the Durable Object namespace for ${original.name}.`,
          });
        }
      }
      for (const expected of releaseBindings.values()) {
        const actual = candidateBindings.find(
          binding => binding.name === expected.binding,
        );
        if (
          actual?.type !== 'service' ||
          actual.service !== expected.service ||
          (actual.environment ?? 'production') !==
            (expected.environment ?? 'production') ||
          (actual.entrypoint ?? 'default') !==
            (expected.entrypoint ?? 'default')
        ) {
          return yield* makeZerospinError({
            code: 'zerospin-owner-release-binding-changed',
            message: `The stable candidate does not bind "${expected.binding}" to owner Worker ${expected.service}.`,
          });
        }
      }
    },
  );
  return {
    publishOwnerReleases,
    incumbentBindingNames: originalBindings
      .filter(binding => binding.name.startsWith(OWNER_RELEASE_BINDING_PREFIX))
      .map(binding => binding.name),
    services: [...releaseBindings.values()],
    verifyCandidateBindings,
  };
});
