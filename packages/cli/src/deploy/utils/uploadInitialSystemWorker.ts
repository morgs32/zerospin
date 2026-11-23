import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Result from 'effect/Result';

import type { bootstrapRecord } from './bootstrapRecord.js';
import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { openDeploymentCloudflare } from './openDeploymentCloudflare.js';
import { prepareBootstrapUpload } from './prepareBootstrapUpload.js';
import { readWorkerDeployment } from './readWorkerDeployment.js';
import { readWorkerVersion } from './readWorkerVersionBindings.js';
import { hasServingWorkerVersion } from './stageSystemWorkerUpdate.js';

/** Upload once, or reconcile the previously sent PUT using the serving version tag. */
export const uploadInitialSystemWorker = Effect.fn('uploadInitialSystemWorker')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    accountId: string,
    record: ReturnType<typeof bootstrapRecord>,
    resume: boolean,
  ) {
    const { project, runId } = workspace;
    const workerName = project.generatedConfig.name;
    const cloudflare = yield* openDeploymentCloudflare(workspace, accountId);
    const bootstrap = {
      runId,
      systemId: project.generatedConfig.vars.ZEROSPIN_SYSTEM_ID,
    };
    const pending = (cause?: unknown) =>
      makeZerospinError({
        code: 'zerospin-bootstrap-upload-pending',
        message:
          'Initial upload ' +
          runId +
          ' for ' +
          workerName +
          ' is unresolved. Rerun from this project to check the exact serving version. Recovery record: ' +
          record.file,
        cause: cause === undefined ? undefined : prettyUnknownFailure(cause),
      });
    let uploadError: unknown;
    if (!resume) {
      const artifact = yield* prepareBootstrapUpload(workspace);
      const absent = yield* Effect.tryPromise({
        try: cloudflare.isWorkerAbsent,
        catch: cause =>
          makeZerospinError({
            code: 'zerospin-bootstrap-absence-unverified',
            message:
              'Cloudflare could not confirm that ' + workerName + ' is absent.',
            cause: prettyUnknownFailure(cause),
          }),
      });
      if (!absent) {
        return yield* makeZerospinError({
          code: 'zerospin-deployment-changed',
          message: 'Cloudflare already has a Worker named ' + workerName + '.',
        });
      }
      yield* record.write(bootstrap);
      const result = yield* Effect.result(
        Effect.tryPromise({
          try: signal => cloudflare.putInitialVersion(artifact, signal),
          catch: cause => cause,
        }),
      );
      if (Result.isFailure(result)) {
        uploadError = result.failure;
      } else if (result.success) {
        yield* record.clear;
        return yield* makeZerospinError({
          code: 'zerospin-bootstrap-upload-rejected',
          message:
            'Cloudflare rejected the initial upload for ' +
            workerName +
            '. ' +
            result.success,
        });
      }
    }

    for (const delay of [0, 1, 2, 4, 8]) {
      if (delay) yield* Effect.sleep(delay * 1000);
      const { deployment } = yield* readWorkerDeployment(workspace).pipe(
        Effect.mapError(pending),
      );
      const versionId = deployment?.versions[0]?.version_id;
      if (
        !deployment ||
        !versionId ||
        !hasServingWorkerVersion(deployment, versionId)
      ) {
        continue;
      }
      const version = yield* readWorkerVersion(workspace, versionId).pipe(
        Effect.mapError(pending),
      );
      if (version.annotations?.['workers/tag'] !== runId) {
        return yield* pending(
          new Error(
            'Observed deployment ' +
              deployment.id +
              ' serving version ' +
              versionId +
              ' without the run tag.',
          ),
        );
      }
      yield* Effect.tryPromise({
        try: cloudflare.closeBootstrapIngress,
        catch: pending,
      });
      yield* record.write({ ...bootstrap, versionId });
      return deployment;
    }
    return yield* pending(uploadError);
  },
);
