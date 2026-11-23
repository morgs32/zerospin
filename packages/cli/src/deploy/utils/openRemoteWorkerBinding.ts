import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
} from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import * as Deferred from 'effect/Deferred';
import type * as Duration from 'effect/Duration';
import * as Effect from 'effect/Effect';
import * as ChildProcess from 'effect/process/ChildProcess';
import * as Stream from 'effect/Stream';

import type { IWranglerDeploymentWorkspace } from './deploymentTypes.js';

/** Scope Wrangler's remote service binding and its local forwarder to this invocation. */
export const openRemoteWorkerBinding = makeFn('openRemoteWorkerBinding')(
  function* (
    workspace: IWranglerDeploymentWorkspace,
    options: {
      service: string;
      entrypoint?: string;
      ownerRpc?: 'getOwnerReleaseIdentity' | 'getOwnerReleaseDeclaration';
      startupTimeout?: Duration.Input;
    },
  ) {
    const directory = path.join(
      workspace.directory,
      `binding-${randomBytes(8).toString('hex')}`,
    );
    const main = path.join(directory, 'worker.mjs');
    const config = path.join(directory, 'wrangler.json');
    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(directory, { mode: 0o700 });
        await Promise.all([
          fs.writeFile(
            main,
            options.ownerRpc
              ? `export default { async fetch(request, env) { return Response.json(await env.REMOTE.${options.ownerRpc}()); } };`
              : 'export default { fetch(request, env) { return env.REMOTE.fetch(request); } };',
            { mode: 0o600 },
          ),
          fs.writeFile(
            config,
            JSON.stringify({
              name: `zerospin-deployment-${randomBytes(8).toString('hex')}`,
              main,
              compatibility_date:
                workspace.project.generatedConfig.compatibility_date,
              services: [
                {
                  binding: 'REMOTE',
                  service: options.service,
                  ...(options.entrypoint
                    ? { entrypoint: options.entrypoint }
                    : {}),
                  remote: true,
                },
              ],
            }),
            { mode: 0o600 },
          ),
        ]);
      },
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-remote-binding-write-failed',
          message: 'Failed to prepare the remote binding forwarder.',
          cause: prettyUnknownFailure(cause),
        }),
    });
    const ready = yield* Deferred.make<string>();
    const child = yield* ChildProcess.make(
      process.execPath,
      [
        workspace.project.wranglerBinPath,
        'dev',
        '--config',
        config,
        '--env-file',
        workspace.envFilePath,
        '--ip',
        '127.0.0.1',
        '--port',
        '0',
        '--show-interactive-dev-session=false',
        '--persist-to',
        path.join(directory, 'state'),
      ],
      {
        cwd: workspace.project.cwd,
        env: workspace.environment,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    let output = '';
    const consume = (stream: typeof child.stdout) => {
      let pendingLine = '';
      return stream.pipe(
        Stream.decodeText(),
        Stream.runForEach(text =>
          Effect.sync(() => {
            output = (output + text).slice(-32768);
            pendingLine += text;
            const lines = pendingLine.split('\n');
            pendingLine = lines.pop() ?? '';
            for (const line of lines) {
              const url = stripVTControlCharacters(line).match(
                /(?:^|\s)Ready on (http:\/\/127\.0\.0\.1:\d+)\/?\s*$/,
              )?.[1];
              if (url && URL.canParse(url)) {
                Deferred.doneUnsafe(ready, Effect.succeed(url));
              }
            }
          }),
        ),
      );
    };
    yield* consume(child.stdout).pipe(Effect.forkScoped);
    yield* consume(child.stderr).pipe(Effect.forkScoped);
    const url = yield* Deferred.await(ready).pipe(
      Effect.raceFirst(
        child.exitCode.pipe(
          Effect.flatMap(code =>
            Effect.fail(
              makeZerospinError({
                code: 'zerospin-remote-binding-exited',
                message: `The remote binding forwarder exited before readiness (${code}).`,
                cause: output,
              }),
            ),
          ),
        ),
      ),
      Effect.timeout(options.startupTimeout ?? '60 seconds'),
      Effect.mapError(cause =>
        isZerospinError(cause)
          ? cause
          : makeZerospinError({
              code: 'zerospin-remote-binding-start-failed',
              message: 'The remote binding forwarder did not become ready.',
              cause: prettyUnknownFailure(cause),
            }),
      ),
    );
    return url;
  },
);
