import { useEffect, useState } from 'react';

import { resolve } from 'node:path';

import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem';
import * as NodePath from '@effect/platform-node-shared/NodePath';
import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { makeZerospinError, type IAnyError } from '@zerospin/error';
import { startStudio } from '@zerospin/studio/startStudio';
import { config as loadEnv } from 'dotenv';
import * as Cause from 'effect/Cause';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';

import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';

/** Own Studio startup and disposal for the mounted CLI command, including cancellation during acquisition. */
export function useStudioServer(portOption?: number) {
  const [state, setState] = useState<{
    data: string | undefined;
    error: IAnyError | undefined;
    status: 'loading' | 'success' | 'error';
  }>({ data: undefined, error: undefined, status: 'loading' });
  useEffect(() => {
    const controller = new globalThis.AbortController();
    let server: { url: string; dispose: () => Promise<void> } | undefined;
    const program = Effect.gen(function* () {
      const projectRoot = process.cwd();
      yield* Effect.sync(() => {
        loadEnv({ path: resolve(projectRoot, '.env.local') });
        loadEnv({ path: resolve(projectRoot, '.env') });
      });
      let port = portOption;
      if (port === undefined) {
        const configuredPort = yield* Config.Port('PORT').pipe(
          Config.option,
          Effect.mapError(() =>
            makeZerospinError({
              code: 'studio-invalid-port',
              message: 'Invalid PORT. Expected an integer from 1 to 65535.',
            }),
          ),
        );
        port = Option.getOrUndefined(configuredPort) ?? 5555;
      }
      const publicUrl = process.env['PORTLESS_URL'];
      const config = yield* loadZerospinConfigFn(projectRoot);
      return yield* startStudio({
        projectRoot,
        port,
        open: true,
        ...(publicUrl ? { publicUrl } : {}),
        systemSpec: makeSystemSpec({ system: config.system }),
        signal: controller.signal,
      });
    }).pipe(
      Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    );
    void Effect.runPromiseExit(program, { signal: controller.signal })
      .then(async exit => {
        if (Exit.isSuccess(exit)) {
          server = exit.value;
          if (controller.signal.aborted) {
            await server.dispose();
            return;
          }
          setState({ data: server.url, error: undefined, status: 'success' });
        } else if (!controller.signal.aborted) {
          const error = Option.getOrElse(
            Cause.findErrorOption(exit.cause),
            () =>
              makeZerospinError({
                code: 'studio-start-failed',
                message: 'Could not start Zerospin Studio.',
              }),
          );
          setState({ data: undefined, error, status: 'error' });
        }
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      void server?.dispose().catch(() => undefined);
    };
  }, [portOption]);
  return state;
}
