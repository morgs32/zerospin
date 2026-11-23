import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';
import { runWranglerCommand } from './runWranglerCommand.js';

const WorkerVersionBindingSchema = Schema.Struct({
  type: Schema.String,
  text: Schema.optionalKey(Schema.String),
  name: Schema.String,
  service: Schema.optionalKey(Schema.String),
  environment: Schema.optionalKey(Schema.String),
  entrypoint: Schema.optionalKey(Schema.String),
  class_name: Schema.optionalKey(Schema.String),
  namespace_id: Schema.optionalKey(Schema.String),
  script_name: Schema.optionalKey(Schema.String),
});

export type IWorkerVersionBinding = typeof WorkerVersionBindingSchema.Type;

const WorkerVersionSchema = Schema.Struct({
  id: Schema.String,
  annotations: Schema.optionalKey(
    Schema.NullOr(Schema.Record(Schema.String, Schema.String)),
  ),
  resources: Schema.Struct({
    bindings: Schema.Array(WorkerVersionBindingSchema),
  }),
});

export const readWorkerVersion = makeFn('readWorkerVersion')(function* (
  workspace: IWranglerDeploymentWorkspace,
  versionId: string,
) {
  const { stdout } = yield* runWranglerCommand(workspace, [
    'versions',
    'view',
    versionId,
    '--json',
  ]);
  return yield* Effect.try({
    try: () => {
      const version = Schema.decodeUnknownSync(WorkerVersionSchema)(
        JSON.parse(stdout),
      );
      if (version.id !== versionId) {
        throw new Error(
          `Wrangler returned version ${version.id} for ${versionId}.`,
        );
      }
      return version;
    },
    catch: cause =>
      makeZerospinError({
        code: 'zerospin-wrangler-version-bindings-invalid',
        message: `Could not read Worker bindings for version ${versionId}.`,
        cause: prettyUnknownFailure(cause),
      }),
  });
});

export function readWorkerVersionBindings(
  workspace: IWranglerDeploymentWorkspace,
  versionId: string,
) {
  return readWorkerVersion(workspace, versionId).pipe(
    Effect.map(version => version.resources.bindings),
  );
}
