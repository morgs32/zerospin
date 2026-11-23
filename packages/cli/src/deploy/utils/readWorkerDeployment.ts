import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type {
  IWorkerDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';
import { runWranglerCommand } from './runWranglerCommand.js';

const WorkerDeployment = Schema.NullOr(
  Schema.Struct({
    id: Schema.String,
    created_on: Schema.String,
    annotations: Schema.optionalKey(
      Schema.Record(Schema.String, Schema.String),
    ),
    versions: Schema.Array(
      Schema.Struct({ version_id: Schema.String, percentage: Schema.Number }),
    ),
  }),
);

export const readWorkerDeployment = makeFn('readWorkerDeployment')(function* (
  workspace: IWranglerDeploymentWorkspace,
) {
  const result = yield* runWranglerCommand(workspace, [
    'deployments',
    'status',
    '--json',
  ]);
  const deployment = yield* Effect.try({
    try: (): IWorkerDeployment | undefined =>
      Schema.decodeUnknownSync(WorkerDeployment)(JSON.parse(result.stdout)) ??
      undefined,
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-wrangler-deployment-invalid',
        message: 'Wrangler returned invalid deployment JSON.',
        cause: prettyUnknownFailure(cause),
      }),
  });
  return { deployment, workerAbsent: result.workerAbsent };
});
