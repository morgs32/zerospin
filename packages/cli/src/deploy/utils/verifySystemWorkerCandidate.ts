import { hashSystemSpec } from '@zerospin/core/system/hashSystemSpec';
import {
  getOwnerReleaseBindingName,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { isEqual } from 'es-toolkit';

import type {
  ICandidateDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import {
  listOwnerReleasePins,
  openCandidateSystemApi,
} from './openCandidateSystemApi.js';
import type { prepareSystemWorkerCandidate } from './prepareSystemWorkerCandidate.js';
import { readWorkerVersionBindings } from './readWorkerVersionBindings.js';

export const verifySystemWorkerCandidate = Effect.fn(
  'verifySystemWorkerCandidate',
)(function* (
  workspace: IWranglerDeploymentWorkspace,
  candidate: Pick<ICandidateDeployment, 'workerName' | 'versionId'>,
  ownerPins: readonly IOwnerReleaseIdentity[],
  agent: Effect.Success<
    ReturnType<typeof prepareSystemWorkerCandidate>
  >['agent'],
  owners?: Effect.Success<
    ReturnType<typeof prepareSystemWorkerCandidate>
  >['owners'],
) {
  const candidateBindings = yield* readWorkerVersionBindings(
    workspace,
    candidate.versionId,
  );
  if (owners) yield* owners.verifyCandidateBindings(candidateBindings);
  yield* agent.verifyStableBindings(candidateBindings);
  const { systemApi, url, readOwnerReleaseBinding } =
    yield* openCandidateSystemApi(workspace, candidate);
  const preflight = yield* systemApi.preflightDeployment({
    systemId: workspace.project.generatedConfig.vars.ZEROSPIN_SYSTEM_ID,
    systemSpec: workspace.project.systemSpec,
  });
  if (preflight.versionId !== candidate.versionId || preflight.bootstrap) {
    return yield* makeZerospinError({
      code: 'zerospin-deployment-changed',
      message:
        'The promoted SystemWorker did not answer as version ' +
        candidate.versionId +
        '.',
    });
  }
  const servingSpec = yield* systemApi.makeSystemSpec();
  const compiledPins = yield* listOwnerReleasePins(
    workspace,
    url,
    candidate.versionId,
  );
  if (
    servingSpec.hash !== workspace.project.systemSpec.hash ||
    hashSystemSpec(servingSpec) !== servingSpec.hash ||
    !isEqual(compiledPins, ownerPins)
  ) {
    return yield* makeZerospinError({
      code: 'zerospin-deployment-system-spec-mismatch',
      message:
        'The promoted SystemWorker did not load the compiled SystemSpec and owner release pins.',
    });
  }
  for (const expected of ownerPins) {
    const actual = yield* readOwnerReleaseBinding(expected.release);
    if (
      actual.versionId !== expected.versionId ||
      actual.specHash !== expected.specHash
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-owner-release-binding-changed',
        message:
          'The promoted SystemWorker binds a different executable for ' +
          getOwnerReleaseBindingName(expected.release) +
          '.',
      });
    }
  }
  return systemApi;
});
