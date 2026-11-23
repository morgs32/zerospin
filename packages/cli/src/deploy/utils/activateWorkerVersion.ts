import { makeZerospinError } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import { runWranglerCommand } from './runWranglerCommand.js';
import { hasServingWorkerVersion } from './stageSystemWorkerUpdate.js';

export const activateWorkerVersion = Effect.fn('activateWorkerVersion')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    props: {
      workerName: string;
      versionId: string;
      priorDeploymentId: string | undefined;
    },
  ) {
    const { workerName, versionId, priorDeploymentId } = props;
    const message = 'zerospin-promote-' + workspace.runId;
    const promotion = yield* Effect.result(
      runWranglerCommand(
        workspace,
        [
          'versions',
          'deploy',
          versionId + '@100%',
          '--yes',
          '--message',
          message,
        ],
        { writesCloudflare: 'confirm-version' },
      ),
    );
    const deploymentId = Result.isSuccess(promotion)
      ? promotion.success.records.find(
          record => record['type'] === 'version-deploy',
        )?.['deployment_id']
      : undefined;
    const serving = (yield* readWorkerDeployment(workspace)).deployment;
    if (
      !serving ||
      serving.id === priorDeploymentId ||
      !hasServingWorkerVersion(serving, versionId) ||
      (typeof deploymentId === 'string'
        ? serving.id !== deploymentId
        : serving.annotations?.['workers/message'] !== message)
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-promotion-unverified',
        message:
          'Could not confirm promotion of ' +
          workerName +
          ' version ' +
          versionId +
          '. Observed deployment ' +
          (serving?.id ?? 'none') +
          '.',
      });
    }
    workspace.pendingCloudflareWrites.delete(workspace.configPath);
    return serving;
  },
);
