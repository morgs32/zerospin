import { execFile, fork } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';

import type { loadDevelopmentProject } from './loadDevelopmentProject.js';
import type { openDevelopmentWorkspace } from './openDevelopmentWorkspace.js';

const run = promisify(execFile);
const readReadyMessage = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      event: Schema.Literal('DEV_SERVER_READY'),
      port: Schema.Number,
    }),
  ),
);

async function buildDevelopmentWorker({
  configPath,
  cwd,
  environment,
  signal,
  wranglerBinPath,
}: {
  configPath: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  signal: AbortSignal;
  wranglerBinPath: string;
}) {
  const config: unknown = JSON.parse(await fs.readFile(configPath, 'utf8'));
  if (
    typeof config !== 'object' ||
    config === null ||
    !('main' in config) ||
    typeof config.main !== 'string'
  ) {
    throw new Error('Generated Wrangler configuration has no entrypoint.');
  }
  const outDir = await fs.mkdtemp(
    path.join(path.dirname(configPath), 'bundle-'),
  );
  await run(
    process.execPath,
    [
      wranglerBinPath,
      'deploy',
      '--dry-run',
      '--config',
      configPath,
      '--outdir',
      outDir,
    ],
    { cwd, env: environment, signal, maxBuffer: 8 * 1024 * 1024 },
  );
  const main = path.join(outDir, path.parse(config.main).name + '.js');
  await fs.access(main);
  await fs.writeFile(
    configPath,
    JSON.stringify({
      ...config,
      main,
      base_dir: outDir,
      no_bundle: true,
      minify: false,
      find_additional_modules: true,
    }),
    { mode: 0o600 },
  );
}

/** Build one configuration snapshot before starting the shared local Workerd. */
export const openDevelopmentWorker = Effect.fn('openDevelopmentWorker')(
  function* (
    project: Effect.Success<ReturnType<typeof loadDevelopmentProject>>,
    workspace: Effect.Success<ReturnType<typeof openDevelopmentWorkspace>>,
    stopped: Deferred.Deferred<void, IAnyError>,
  ) {
    const { cwd, port, wranglerBinPath } = project;
    const { configPaths, environment, persistPath } = workspace;
    yield* Effect.forEach(
      configPaths,
      configPath =>
        Effect.tryPromise({
          try: signal =>
            buildDevelopmentWorker({
              configPath,
              cwd,
              environment,
              signal,
              wranglerBinPath,
            }),
          catch: cause =>
            makeZerospinError({
              code: 'zerospin-dev-worker-build-failed',
              message: `Could not build the local Worker for ${path.basename(configPath)}.`,
              cause: prettyUnknownFailure(cause),
            }),
        }),
      { concurrency: 2, discard: true },
    );

    const failure = (cause: unknown) =>
      makeZerospinError({
        code: 'zerospin-dev-wrangler-failed',
        message: 'Could not run the local Workers.',
        cause: prettyUnknownFailure(cause),
      });
    const ready = yield* Deferred.make<string>();
    yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          const child = fork(
            wranglerBinPath,
            [
              'dev',
              '--local',
              '--no-show-interactive-dev-session',
              '--ip',
              '127.0.0.1',
              '--port',
              String(port ?? 0),
              '--persist-to',
              persistPath,
              ...configPaths.flatMap(configPath => ['--config', configPath]),
            ],
            {
              cwd,
              env: environment,
              execArgv: [],
              stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
            },
          );
          const closed = new Promise<void>(resolve =>
            child.once('close', () => resolve()),
          );
          let reportedReady = false;
          child.on('message', message => {
            if (typeof message !== 'string') return;
            const result = readReadyMessage(message);
            if (Option.isNone(result)) return;
            const readyPort = result.value.port;
            if (
              !Number.isInteger(readyPort) ||
              readyPort < 1 ||
              readyPort > 65_535
            ) {
              return;
            }
            reportedReady = true;
            Deferred.doneUnsafe(
              ready,
              Effect.succeed(`http://127.0.0.1:${readyPort}`),
            );
          });
          child.on('error', error =>
            Deferred.doneUnsafe(stopped, Effect.fail(failure(error))),
          );
          child.once('exit', (code, signal) =>
            Deferred.doneUnsafe(
              stopped,
              code === 0 && reportedReady
                ? Effect.void
                : Effect.fail(failure(`Wrangler exited: ${signal ?? code}`)),
            ),
          );
          return { child, closed };
        },
        catch: failure,
      }),
      ({ child, closed }) =>
        Effect.promise(async () => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGTERM');
          }
          await closed;
        }),
    );
    return yield* Deferred.await(ready).pipe(
      Effect.timeoutOrElse({
        duration: '90 seconds',
        orElse: () =>
          Effect.fail(
            makeZerospinError({
              code: 'zerospin-dev-wrangler-not-ready',
              message:
                'Wrangler did not report readiness for the local Workers.',
            }),
          ),
      }),
    );
  },
);
