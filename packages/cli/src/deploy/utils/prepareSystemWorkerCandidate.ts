import fs from 'node:fs/promises';

import {
  getOwnerReleaseBindingName,
  getOwnerReleaseWorkerName,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import {
  listOwnerReleasePins,
  readOwnerReleaseBinding,
} from './openCandidateSystemApi.js';
import { prepareAgentWorker } from './prepareAgentWorker.js';
import { prepareOwnerReleaseBindings } from './prepareOwnerReleaseBindings.js';
import { readWorkerVersionBindings } from './readWorkerVersionBindings.js';
import type { verifyServingSystem } from './verifyServingSystem.js';

export const prepareSystemWorkerCandidate = Effect.fn(
  'prepareSystemWorkerCandidate',
)(function* (
  workspace: IWranglerDeploymentWorkspace,
  serving: Effect.Success<ReturnType<typeof verifyServingSystem>>,
) {
  const { url, versionId, bootstrap, acceptedOwnerReleases } = serving;
  const { generatedConfig, systemSpec } = workspace.project;
  const servingBindings = yield* readWorkerVersionBindings(
    workspace,
    versionId,
  );
  const acceptedPins = new Map(
    acceptedOwnerReleases.map(pin => [
      getOwnerReleaseBindingName(pin.release),
      pin,
    ]),
  );
  const owners = yield* prepareOwnerReleaseBindings(
    workspace,
    servingBindings,
    acceptedPins,
  );
  const agentWorker = yield* prepareAgentWorker(
    workspace,
    servingBindings,
    bootstrap,
  );
  const incumbentPins = bootstrap
    ? []
    : yield* listOwnerReleasePins(workspace, url, versionId);
  const pinnedNames = new Set<string>(
    incumbentPins.map(pin => getOwnerReleaseBindingName(pin.release)),
  );
  if (
    pinnedNames.size !== owners.incumbentBindingNames.length ||
    owners.incumbentBindingNames.some(name => !pinnedNames.has(name))
  ) {
    return yield* makeZerospinError({
      code: 'zerospin-owner-release-binding-changed',
      message:
        'The serving manifest does not identify all retained owner release bindings.',
    });
  }
  for (const pin of incumbentPins) {
    const accepted = acceptedPins.get(getOwnerReleaseBindingName(pin.release));
    if (!isEqual(accepted, pin)) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-binding-changed',
        message:
          'The serving manifest disagrees with the accepted pin for ' +
          JSON.stringify(pin.release) +
          '.',
      });
    }
    const executing = yield* readOwnerReleaseBinding(
      workspace,
      url,
      versionId,
      pin.release,
    );
    if (!isEqual(executing, pin)) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-binding-changed',
        message:
          'The serving binding disagrees with the accepted executable for ' +
          JSON.stringify(pin.release) +
          '.',
      });
    }
  }

  const agentIncumbent = yield* agentWorker.provision;
  const publishedOwners = yield* owners.publishOwnerReleases();
  const ownerPins = [...incumbentPins, ...publishedOwners];
  const agent = yield* agentWorker.stage(agentIncumbent, owners.services);
  yield* Effect.tryPromise({
    try: () =>
      Promise.all([
        fs.writeFile(
          workspace.stableSpecPath,
          JSON.stringify({
            spec: systemSpec,
            ownerReleases: ownerPins,
          }),
          { mode: 0o600 },
        ),
        fs.writeFile(
          workspace.configPath,
          JSON.stringify({
            ...agent.stableConfig,
            workers_dev: true,
            preview_urls: false,
            services: [...owners.services, agent.service],
          }),
          { mode: 0o600 },
        ),
      ]),
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-wrangler-temp-files-write-failed',
        message: 'Failed to write the SystemWorker candidate configuration.',
        cause: prettyUnknownFailure(cause),
      }),
  });
  for (const pin of ownerPins) {
    process.stdout.write(
      'Owner Worker ' +
        getOwnerReleaseWorkerName(generatedConfig.name, pin.release) +
        ' version ' +
        pin.versionId +
        '\n',
    );
  }
  process.stdout.write(
    'Agent Worker ' +
      agent.service.service +
      ' candidate version ' +
      agent.versionId +
      '\n',
  );
  return { owners, agent, ownerPins };
});
