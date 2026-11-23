import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import * as Schema from 'effect/Schema';
import * as Stream from 'effect/Stream';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';

/** Read structured failure output as well as successful command records. */
export const runWranglerCommand = makeFn('runWranglerCommand')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    args: string[],
    options: {
      writesCloudflare?: boolean | 'confirm-version';
      sensitiveOutput?: boolean;
    } = {},
  ) {
    const outputPath = path.join(workspace.directory, `${randomUUID()}.jsonl`);
    if (options.writesCloudflare) {
      workspace.pendingCloudflareWrites.add(workspace.configPath);
    }
    const child = yield* ChildProcess.make(
      process.execPath,
      [
        workspace.project.wranglerBinPath,
        ...args,
        '--config',
        workspace.configPath,
        '--env-file',
        workspace.envFilePath,
      ],
      {
        cwd: workspace.project.cwd,
        env: {
          ...workspace.environment,
          WRANGLER_OUTPUT_FILE_PATH: outputPath,
        },
        stdin: 'inherit',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    let stdout = '';
    let stderr = '';
    const [exitCode] = yield* Effect.all(
      [
        child.exitCode,
        child.stdout.pipe(
          Stream.decodeText(),
          Stream.runForEach(text =>
            Effect.sync(() => {
              stdout += text;
              if (!options.sensitiveOutput && !args.includes('--json')) {
                process.stdout.write(text);
              }
            }),
          ),
        ),
        child.stderr.pipe(
          Stream.decodeText(),
          Stream.runForEach(text =>
            Effect.sync(() => {
              stderr += text;
              if (!options.sensitiveOutput && !args.includes('--json')) {
                process.stderr.write(text);
              }
            }),
          ),
        ),
      ],
      { concurrency: 'unbounded' },
    );
    const records = yield* Effect.tryPromise({
      try: async () => {
        let output: string;
        try {
          output = await fs.readFile(outputPath, 'utf8');
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          ) {
            return [];
          }
          throw error;
        }
        return Schema.decodeUnknownSync(
          Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
        )(
          output
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line)),
        );
      },
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-wrangler-output-invalid',
          message: 'Wrangler returned invalid structured command output.',
          cause: options.sensitiveOutput
            ? undefined
            : prettyUnknownFailure(cause),
        }),
    });
    if (exitCode !== 0) {
      const failure = records.find(
        record => record['type'] === 'command-failed',
      );
      if (args[0] === 'deployments' && args[1] === 'status') {
        if (failure?.['code'] === 10007) {
          return { stdout: 'null', records: [], workerAbsent: true };
        }
        if (
          typeof failure?.['message'] === 'string' &&
          /^The Worker [a-z0-9-]+ has no deployments[.]$/.test(
            failure['message'],
          )
        ) {
          return { stdout: 'null', records: [], workerAbsent: false };
        }
      }
      return yield* Effect.fail(
        makeZerospinError({
          code: 'zerospin-wrangler-exited',
          message: `Wrangler ${args.slice(0, 2).join(' ')} exited with code ${exitCode}.`,
          cause: options.sensitiveOutput
            ? undefined
            : `${stdout}\n${stderr}`.trim(),
          extra: options.sensitiveOutput
            ? undefined
            : { commandFailure: failure ?? null },
        }),
      );
    }
    if (options.writesCloudflare === true) {
      workspace.pendingCloudflareWrites.delete(workspace.configPath);
    }
    return { stdout, records, workerAbsent: false };
  },
  Effect.scoped,
  Effect.mapError(cause =>
    isZerospinError(cause)
      ? cause
      : makeZerospinError({
          code: 'zerospin-wrangler-process-failed',
          message: 'Failed to run Wrangler.',
          cause: prettyUnknownFailure(cause),
        }),
  ),
);

/** A successful process exit does not identify the uploaded Worker version. */
export const publishWranglerWorkerVersion = makeFn(
  'publishWranglerWorkerVersion',
)(function* (
  workspace: IWranglerDeploymentWorkspace,
  args: string[],
  props: { workerName: string; recordType: 'deploy' | 'version-upload' },
) {
  const { records } = yield* runWranglerCommand(workspace, args, {
    writesCloudflare: 'confirm-version',
  });
  const versionIds = new Set(
    records
      .filter(record => record['type'] === props.recordType)
      .map(record => record['version_id']),
  );
  const [versionId] = versionIds;
  if (
    versionIds.size !== 1 ||
    typeof versionId !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(versionId)
  ) {
    return yield* makeZerospinError({
      code: 'zerospin-wrangler-version-output-missing',
      message: `Wrangler did not report an unambiguous version ID for Worker ${props.workerName}.`,
    });
  }
  workspace.pendingCloudflareWrites.delete(workspace.configPath);
  return versionId;
});
