import { randomUUID } from 'node:crypto';

import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';

import type {
  ICandidateDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import type {
  ISystemTrafficIntent,
  systemTrafficRecord,
} from './systemTrafficRecord.js';
import { writeSystemWorkerTraffic } from './writeSystemWorkerTraffic.js';

export const promoteSystemWorkerUpdate = makeFn('promoteSystemWorkerUpdate')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    candidate: ICandidateDeployment,
    record: ReturnType<typeof systemTrafficRecord>,
    preparation: NonNullable<ISystemTrafficIntent['preparation']>,
  ) {
    const current = (yield* readWorkerDeployment(workspace)).deployment;
    if (
      current?.id !== candidate.stagedDeploymentId ||
      current.versions.length !== 2 ||
      !current.versions.some(
        version =>
          version.version_id === candidate.incumbentVersionId &&
          version.percentage === 100,
      ) ||
      !current.versions.some(
        version =>
          version.version_id === candidate.versionId &&
          version.percentage === 0,
      )
    ) {
      return yield* makeZerospinError({
        code: 'zerospin-deployment-changed',
        message:
          'Cloudflare no longer matches staged deployment ' +
          candidate.stagedDeploymentId +
          '.',
      });
    }

    return yield* writeSystemWorkerTraffic(workspace, record, {
      phase: 'promote',
      preparation,
      priorDeploymentId: current.id,
      message: 'zerospin-promote-' + randomUUID(),
      versions: [{ version_id: candidate.versionId, percentage: 100 }],
    });
  },
);
