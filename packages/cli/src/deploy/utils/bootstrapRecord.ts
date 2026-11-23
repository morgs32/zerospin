import fs from 'node:fs/promises';
import path from 'node:path';

import { ReleaseSpecSchema } from '@zerospin/core/declaration/ReleaseSpecSchemas';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';

const VersionId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu),
);
const BootstrapRecordSchema = Schema.Struct({
  runId: VersionId,
  systemId: Schema.NonEmptyString,
  versionId: Schema.optionalKey(VersionId),
  owner: Schema.optionalKey(
    Schema.Struct({
      specHash: Schema.NonEmptyString,
      releaseSpec: ReleaseSpecSchema,
    }),
  ),
});
export type IBootstrapRecord = typeof BootstrapRecordSchema.Type;

export function bootstrapRecord(
  workspace: IWranglerDeploymentWorkspace,
  accountId: string,
  ownerWorkerName?: string,
) {
  const { project } = workspace;
  const operation =
    ownerWorkerName === undefined ? 'bootstrap' : 'owner-upload';
  const workerName = ownerWorkerName ?? project.generatedConfig.name;
  const file = path.join(
    path.dirname(workspace.directory),
    operation + '-' + accountId + '-' + workerName + '.json',
  );
  const failure = (cause: unknown) =>
    makeZerospinError({
      code: 'zerospin-bootstrap-record-invalid',
      message:
        'Could not use the local ' + operation + ' record at ' + file + '.',
      cause: prettyUnknownFailure(cause),
    });
  return {
    file,
    read: Effect.tryPromise({
      try: async () => {
        const data = await fs.readFile(file, 'utf8').catch(error => {
          if (error?.code === 'ENOENT') return undefined;
          throw error;
        });
        if (data === undefined) return;
        const record = Schema.decodeUnknownSync(BootstrapRecordSchema)(
          JSON.parse(data),
        );
        if (
          record.systemId !== project.generatedConfig.vars.ZEROSPIN_SYSTEM_ID
        ) {
          throw new Error('The saved upload belongs to a different System ID.');
        }
        return record;
      },
      catch: failure,
    }),
    write: (record: IBootstrapRecord) =>
      Effect.tryPromise({
        try: async () => {
          const temporary = path.join(workspace.directory, path.basename(file));
          await fs.writeFile(temporary, JSON.stringify(record) + '\n', {
            mode: 0o600,
          });
          await fs.rename(temporary, file);
        },
        catch: failure,
      }),
    clear: Effect.tryPromise({
      try: () => fs.rm(file, { force: true }),
      catch: failure,
    }),
  };
}
