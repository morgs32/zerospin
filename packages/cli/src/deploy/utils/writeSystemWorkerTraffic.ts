import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import { runWranglerCommand } from './runWranglerCommand.js';
import {
  matchesSystemTrafficIntent,
  type ISystemTrafficIntent,
  type systemTrafficRecord,
} from './systemTrafficRecord.js';

export const writeSystemWorkerTraffic = makeFn('writeSystemWorkerTraffic')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    record: ReturnType<typeof systemTrafficRecord>,
    intent: ISystemTrafficIntent,
  ) {
    yield* record.write(intent);
    const { records } = yield* runWranglerCommand(
      workspace,
      [
        'versions',
        'deploy',
        ...intent.versions.map(
          version => version.version_id + '@' + version.percentage + '%',
        ),
        '--yes',
        '--message',
        intent.message,
      ],
      { writesCloudflare: 'confirm-version' },
    );
    const reportedId = records.find(
      entry => entry['type'] === 'version-deploy',
    )?.['deployment_id'];
    const { deployment } = yield* readWorkerDeployment(workspace);
    if (
      !deployment ||
      !matchesSystemTrafficIntent(deployment, intent) ||
      (typeof reportedId === 'string' && deployment.id !== reportedId)
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-system-traffic-write-pending',
        message:
          'Cloudflare did not confirm ' +
          intent.message +
          '. Recovery record: ' +
          record.file +
          '.',
      });
    }
    workspace.pendingCloudflareWrites.delete(workspace.configPath);
    return deployment;
  },
);
