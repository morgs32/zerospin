import { randomUUID } from 'node:crypto';

import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import type {
  ICandidateDeployment,
  IWorkerDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import { publishWranglerWorkerVersion } from './runWranglerCommand.js';
import type { systemTrafficRecord } from './systemTrafficRecord.js';
import { writeSystemWorkerTraffic } from './writeSystemWorkerTraffic.js';

export function hasServingWorkerVersion(
  deployment: IWorkerDeployment | undefined,
  versionId: string,
) {
  return (
    deployment?.versions.length === 1 &&
    deployment.versions[0]?.version_id === versionId &&
    deployment.versions[0].percentage === 100
  );
}

/** Stage the disk build at zero traffic, replacing any settled prior candidate. */
export const stageSystemWorkerUpdate = makeFn('stageSystemWorkerUpdate')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    incumbent: IWorkerDeployment,
    record: ReturnType<typeof systemTrafficRecord>,
  ) {
    const incumbentVersionId = incumbent.versions.find(
      version => version.percentage === 100,
    )?.version_id;
    const current = (yield* readWorkerDeployment(workspace)).deployment;
    if (current?.id !== incumbent.id || !incumbentVersionId) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-changed',
        message: 'The System Worker changed while preparing owner releases.',
      });
    }
    const workerName = workspace.project.generatedConfig.name;
    const versionId = yield* publishWranglerWorkerVersion(
      workspace,
      [
        'versions',
        'upload',
        '--secrets-file',
        workspace.secretsPath,
        '--tag',
        workspace.runId,
      ],
      { workerName, recordType: 'version-upload' },
    );
    if (
      (yield* readWorkerDeployment(workspace)).deployment?.id !== incumbent.id
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-changed',
        message: 'The System Worker changed during candidate upload.',
      });
    }
    const stage = yield* writeSystemWorkerTraffic(workspace, record, {
      phase: 'stage',
      priorDeploymentId: incumbent.id,
      message: 'zerospin-stage-' + randomUUID(),
      versions: [
        { version_id: incumbentVersionId, percentage: 100 },
        { version_id: versionId, percentage: 0 },
      ],
    });
    return {
      workerName,
      versionId,
      incumbentVersionId,
      stagedDeploymentId: stage.id,
    } satisfies ICandidateDeployment;
  },
);
