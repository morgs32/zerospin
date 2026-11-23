import fs from 'node:fs/promises';
import path from 'node:path';

import {
  configureAgentPlacement,
  makeAgentWranglerConfig,
} from '@zerospin/dev-worker/makeWranglerConfig';
import {
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { activateWorkerVersion } from './activateWorkerVersion.js';
import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import {
  readWorkerVersionBindings,
  type IWorkerVersionBinding,
} from './readWorkerVersionBindings.js';
import { publishWranglerWorkerVersion } from './runWranglerCommand.js';
import { hasServingWorkerVersion } from './stageSystemWorkerUpdate.js';

interface INamespace {
  name: string;
  class_name: string;
  script_name?: string;
  namespaceId?: string;
}

function requireNamespace(
  bindings: readonly IWorkerVersionBinding[],
  expected: INamespace,
  workerName: string,
): Effect.Effect<INamespace & { namespaceId: string }, IAnyError> {
  const binding = bindings.find(binding => binding.name === expected.name);
  if (
    binding?.type !== 'durable_object_namespace' ||
    binding.class_name !== expected.class_name ||
    !binding.namespace_id ||
    (binding.script_name ?? workerName) !== (expected.script_name ?? workerName)
  ) {
    return Effect.fail(
      makeZerospinError({
        code: 'zerospin-agent-worker-namespace-unverified',
        message: `Could not verify the ${expected.name} namespace on Worker ${workerName}.`,
      }),
    );
  }
  if (
    expected.namespaceId !== undefined &&
    binding.namespace_id !== expected.namespaceId
  ) {
    return Effect.fail(
      makeZerospinError({
        code: 'zerospin-agent-worker-namespace-changed',
        message: `Worker ${workerName} would change the ${expected.name} namespace.`,
      }),
    );
  }
  return Effect.succeed({ ...expected, namespaceId: binding.namespace_id });
}

/** Fresh Systems get an Agent Worker. Redeploys prove the placement and IDs before writing. */
export const prepareAgentWorker = makeFn('prepareAgentWorker')(function* (
  workspace: IWranglerDeploymentWorkspace,
  servingBindings: readonly IWorkerVersionBinding[],
  bootstrap: boolean,
) {
  const { generatedConfig, agentWorkerMain } = workspace.project;
  const stableName = generatedConfig.name;
  const agent = makeAgentWranglerConfig({
    stable: generatedConfig,
    main: agentWorkerMain,
    configModulePath: workspace.project.configModulePath,
    application: workspace.project.applicationBindings,
  });
  const bindings: readonly INamespace[] = agent.durable_objects.bindings;
  const local = bindings.filter(binding => binding.script_name === undefined);
  const remote = bindings.filter(binding => binding.script_name !== undefined);
  const existing = servingBindings.filter(binding =>
    local.some(({ name }) => name === binding.name),
  );
  const freshPlacement = bootstrap && existing.length === 0;
  const original = freshPlacement
    ? []
    : yield* Effect.forEach(local, binding =>
        requireNamespace(
          servingBindings,
          { ...binding, script_name: agent.name },
          stableName,
        ),
      );
  const dependencies = yield* Effect.forEach(remote, binding =>
    requireNamespace(servingBindings, binding, stableName),
  );
  const configPath = path.join(workspace.directory, 'agent-worker.json');
  yield* Effect.tryPromise({
    try: () => fs.writeFile(configPath, JSON.stringify(agent), { mode: 0o600 }),
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-wrangler-temp-files-write-failed',
        message: 'Failed to prepare the Agent Worker deployment file.',
        cause: prettyUnknownFailure(cause),
      }),
  });

  const agentWorkspace = { ...workspace, configPath };
  const { deployment, workerAbsent } =
    yield* readWorkerDeployment(agentWorkspace);
  const servingVersionId = deployment?.versions[0]?.version_id;
  const fresh = workerAbsent && freshPlacement;
  if (servingVersionId !== undefined) {
    process.stdout.write(
      'Serving Agent Worker ' +
        agent.name +
        ' version ' +
        servingVersionId +
        '\n',
    );
  }
  if (
    !fresh &&
    (servingVersionId === undefined ||
      !hasServingWorkerVersion(deployment, servingVersionId))
  ) {
    return yield* makeZerospinError({
      code: 'zerospin-agent-worker-deployment-changed',
      message: `Could not match one active version of Agent Worker ${agent.name}.`,
    });
  }
  const verifyAgentBindings = Effect.fn('verifyAgentWorkerBindings')(function* (
    versionId: string,
    expected: readonly INamespace[],
  ) {
    const bindings = yield* readWorkerVersionBindings(
      agentWorkspace,
      versionId,
    );
    yield* Effect.forEach(
      dependencies,
      binding => requireNamespace(bindings, binding, agent.name),
      { discard: true },
    );
    return yield* Effect.forEach(expected, binding =>
      requireNamespace(bindings, binding, agent.name),
    );
  });
  // Stable's remote binding and AgentWorker's local binding must identify the
  // same namespace. Retain the ID on both sides of all later rollouts.
  const expected = local.map(binding => {
    const incumbent = original.find(original => original.name === binding.name);
    return incumbent === undefined
      ? binding
      : { ...binding, namespaceId: incumbent.namespaceId };
  });
  const retained =
    servingVersionId === undefined
      ? expected
      : yield* verifyAgentBindings(servingVersionId, expected);
  const upload = (deploy: boolean) =>
    Effect.gen(function* () {
      const args = deploy ? ['deploy'] : ['versions', 'upload'];
      args.push('--tag', workspace.runId);
      if (workspace.ownerTelemetrySecretsPath !== undefined) {
        args.push('--secrets-file', workspace.ownerTelemetrySecretsPath);
      }
      return yield* publishWranglerWorkerVersion(agentWorkspace, args, {
        workerName: agent.name,
        recordType: deploy ? 'deploy' : 'version-upload',
      });
    });
  const provision = fresh
    ? Effect.gen(function* () {
        const versionId = yield* upload(true);
        yield* verifyAgentBindings(versionId, retained);
        const current = (yield* readWorkerDeployment(agentWorkspace))
          .deployment;
        if (!hasServingWorkerVersion(current, versionId)) {
          return yield* makeZerospinError({
            code: 'zerospin-agent-worker-deployment-changed',
            message:
              'Cloudflare did not activate the initial private AgentWorker.',
          });
        }
        process.stdout.write(
          'Initial Agent Worker ' + agent.name + ' version ' + versionId + '\n',
        );
        return current;
      })
    : Effect.succeed(deployment);
  const stage = Effect.fn('stageAgentWorker')(function* (
    incumbent: Effect.Success<typeof provision>,
    services: readonly {
      binding: string;
      service: string;
      environment?: string;
      entrypoint?: string;
    }[],
    recovery?: { versionId: string; priorDeploymentId: string },
  ) {
    yield* Effect.tryPromise({
      try: () =>
        fs.writeFile(
          configPath,
          JSON.stringify({
            ...agent,
            services: [...(agent.services ?? []), ...services],
          }),
          { mode: 0o600 },
        ),
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-wrangler-temp-files-write-failed',
          message: 'Failed to write the serving AgentWorker configuration.',
          cause: prettyUnknownFailure(cause),
        }),
    });
    if (!incumbent) {
      return yield* makeZerospinError({
        code: 'zerospin-agent-worker-deployment-changed',
        message: `No incumbent deployment was verified for AgentWorker ${agent.name}.`,
      });
    }
    const versionId = recovery?.versionId ?? (yield* upload(false));
    const priorDeploymentId = recovery?.priorDeploymentId ?? incumbent.id;
    const namespaces = yield* verifyAgentBindings(versionId, retained);
    const activate = Effect.fn('activateAgentWorker')(function* () {
      const current = (yield* readWorkerDeployment(agentWorkspace)).deployment;
      if (hasServingWorkerVersion(current, versionId)) return;
      if (current?.id !== priorDeploymentId) {
        return yield* makeZerospinError({
          code: 'zerospin-agent-worker-deployment-changed',
          message: `AgentWorker ${agent.name} changed during preparation.`,
        });
      }
      const serving = yield* activateWorkerVersion(agentWorkspace, {
        workerName: agent.name,
        versionId,
        priorDeploymentId,
      });
      process.stdout.write(
        'Agent Worker ' +
          agent.name +
          ' now serves ' +
          versionId +
          ' in deployment ' +
          serving.id +
          '\n',
      );
    });

    return {
      versionId,
      priorDeploymentId,
      stableConfig: configureAgentPlacement(generatedConfig, 'separate'),
      service: { binding: 'ZEROSPIN_AGENT_WORKER', service: agent.name },
      verifyStableBindings: (bindings: readonly IWorkerVersionBinding[]) =>
        Effect.gen(function* () {
          const service = bindings.find(
            binding => binding.name === 'ZEROSPIN_AGENT_WORKER',
          );
          if (service?.type !== 'service' || service.service !== agent.name) {
            return yield* makeZerospinError({
              code: 'zerospin-agent-worker-binding-unverified',
              message: 'The candidate does not bind the System AgentWorker.',
            });
          }
          yield* Effect.forEach(
            [
              ...dependencies,
              ...namespaces.map(binding => ({
                ...binding,
                script_name: agent.name,
              })),
            ],
            binding => requireNamespace(bindings, binding, stableName),
            { discard: true },
          );
        }),
      activate: activate(),
    };
  });
  return { provision, stage };
});
