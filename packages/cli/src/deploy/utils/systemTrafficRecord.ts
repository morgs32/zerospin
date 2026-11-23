import fs from 'node:fs/promises';
import path from 'node:path';

import {
  OwnerReleaseIdentitySchema,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import type {
  IWorkerDeployment,
  IWranglerDeploymentWorkspace,
} from './deploymentTypes.js';

export interface ISystemTrafficIntent {
  phase: 'stage' | 'promote';
  priorDeploymentId: string;
  message: string;
  versions: IWorkerDeployment['versions'];
  preparation?: {
    specHash: string;
    ownerReleases: readonly IOwnerReleaseIdentity[];
    agentVersionId: string;
    agentPriorDeploymentId: string;
  };
}

const SystemTrafficIntentSchema = Schema.Struct({
  phase: Schema.Literals(['stage', 'promote']),
  priorDeploymentId: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
  preparation: Schema.optionalKey(
    Schema.Struct({
      specHash: Schema.NonEmptyString,
      ownerReleases: Schema.Array(OwnerReleaseIdentitySchema),
      agentVersionId: Schema.NonEmptyString,
      agentPriorDeploymentId: Schema.NonEmptyString,
    }),
  ),
  versions: Schema.Array(
    Schema.Struct({
      version_id: Schema.NonEmptyString,
      percentage: Schema.Literals([0, 100]),
    }),
  ),
}).check(
  Schema.makeFilter(({ phase, versions }) => {
    const [first, second] = versions;
    if (phase === 'promote') {
      return (
        (versions.length === 1 && first?.percentage === 100) ||
        'Promotion must assign one version 100% of traffic'
      );
    }
    return (
      (versions.length === 2 &&
        first !== undefined &&
        second !== undefined &&
        first.version_id !== second.version_id &&
        first.percentage !== second.percentage) ||
      'Staging must assign distinct versions 100% and 0% of traffic'
    );
  }),
) satisfies Schema.Schema<ISystemTrafficIntent>;

const SystemTrafficRecordSchema = Schema.Struct({
  systemId: Schema.NonEmptyString,
  intent: SystemTrafficIntentSchema,
});
const decodeSystemTrafficRecord = Schema.decodeUnknownSync(
  SystemTrafficRecordSchema,
  { onExcessProperty: 'error' },
);

export function systemTrafficRecord(
  workspace: IWranglerDeploymentWorkspace,
  accountId: string,
) {
  const { generatedConfig } = workspace.project;
  const systemId = generatedConfig.vars.ZEROSPIN_SYSTEM_ID;
  const file = path.join(
    path.dirname(workspace.directory),
    'system-traffic-' + accountId + '-' + generatedConfig.name + '.json',
  );
  const failure = (cause: unknown) =>
    makeZerospinError({
      code: 'zerospin-system-traffic-record-invalid',
      message:
        'Could not use the local System Worker traffic record at ' + file + '.',
      cause: prettyUnknownFailure(cause),
    });

  return {
    file,
    read: Effect.tryPromise({
      try: async (): Promise<ISystemTrafficIntent | undefined> => {
        const data = await fs.readFile(file, 'utf8').catch(error => {
          if (error?.code === 'ENOENT') return undefined;
          throw error;
        });
        if (data === undefined) return;
        const record = decodeSystemTrafficRecord(JSON.parse(data));
        if (record.systemId !== systemId) {
          throw new Error(
            'The saved traffic intent belongs to a different System ID.',
          );
        }
        return record.intent;
      },
      catch: failure,
    }),
    write: (intent: ISystemTrafficIntent) =>
      Effect.tryPromise({
        try: async () => {
          const record = decodeSystemTrafficRecord({ systemId, intent });
          const temporary = path.join(
            workspace.directory,
            'system-traffic-record.json',
          );
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

export function matchesSystemTrafficIntent(
  deployment: IWorkerDeployment | undefined,
  intent: ISystemTrafficIntent,
) {
  if (
    deployment === undefined ||
    deployment.id === intent.priorDeploymentId ||
    deployment.annotations?.['workers/message'] !== intent.message ||
    deployment.versions.length !== intent.versions.length
  ) {
    return false;
  }

  return intent.versions.every(expected =>
    deployment.versions.some(
      version =>
        version.version_id === expected.version_id &&
        version.percentage === expected.percentage,
    ),
  );
}
