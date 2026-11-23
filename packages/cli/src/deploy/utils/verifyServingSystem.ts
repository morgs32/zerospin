import { OwnerReleaseIdentitySchema } from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemGatewayRpc } from '@zerospin/core/systemApi/ISystemGatewayRpc';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type {
  IWorkerDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import { openRemoteWorkerBinding } from './openRemoteWorkerBinding.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import { hasServingWorkerVersion } from './stageSystemWorkerUpdate.js';
import {
  matchesSystemTrafficIntent,
  type ISystemTrafficIntent,
} from './systemTrafficRecord.js';

export const verifyServingSystem = Effect.fn('verifyServingSystem')(function* (
  workspace: IWranglerDeploymentWorkspace,
  deployment: IWorkerDeployment | undefined,
  priorTraffic?: ISystemTrafficIntent,
) {
  const { project } = workspace;
  const workerName = project.generatedConfig.name;
  const versionId = deployment?.versions.find(
    version => version.percentage === 100,
  )?.version_id;
  if (
    !deployment ||
    !versionId ||
    (!hasServingWorkerVersion(deployment, versionId) &&
      !(
        priorTraffic?.phase === 'stage' &&
        matchesSystemTrafficIntent(deployment, priorTraffic)
      ))
  ) {
    return yield* makeZerospinError({
      code: 'zerospin-serving-deployment-unverified',
      message:
        'Cloudflare did not report a verified serving version for ' +
        workerName +
        '. Observed ' +
        (deployment
          ? deployment.id + ' ' + JSON.stringify(deployment.versions)
          : 'no active deployment') +
        '.',
    });
  }
  const { url, preflight, acceptedOwnerReleases } = yield* Effect.gen(
    function* () {
      const url = yield* openRemoteWorkerBinding(workspace, {
        service: workerName,
      });
      const api = yield* getApi<ISystemGatewayRpc>(url)(gateway =>
        gateway.getSystemApi({ zerospinSecretKey: project.keys.secretKey }),
      );
      const preflight = yield* api.preflightDeployment({
        systemId: project.generatedConfig.vars.ZEROSPIN_SYSTEM_ID,
        systemSpec: project.systemSpec,
      });
      const acceptedOwnerReleases = yield* Schema.decodeUnknownEffect(
        Schema.Array(OwnerReleaseIdentitySchema),
      )(preflight.acceptedOwnerReleases).pipe(
        Effect.mapError(() =>
          makeZerospinError({
            code: 'zerospin-owner-release-pins-unavailable',
            message:
              'The serving System Worker could not attest the accepted owner Worker pins.',
          }),
        ),
      );
      return { url, preflight, acceptedOwnerReleases };
    },
  ).pipe(
    Effect.mapError(cause =>
      makeZerospinError({
        code: 'zerospin-deployment-preflight-rejected',
        message:
          workerName +
          ' deployment ' +
          deployment.id +
          ' version ' +
          versionId +
          ' did not verify System identity or retained compatibility.',
        cause: prettyUnknownFailure(cause),
      }),
    ),
  );
  const current = (yield* readWorkerDeployment(workspace)).deployment;
  if (preflight.versionId !== versionId || current?.id !== deployment.id) {
    return yield* makeZerospinError({
      code: 'zerospin-deployment-changed',
      message:
        'Serving deployment changed during preflight. Expected ' +
        deployment.id +
        ' version ' +
        versionId +
        ', observed ' +
        (current?.id ?? 'none') +
        ' and runtime version ' +
        (preflight.versionId ?? 'none') +
        '.',
    });
  }
  return {
    deployment,
    url,
    versionId,
    bootstrap: preflight.bootstrap,
    acceptedOwnerReleases,
  };
});
