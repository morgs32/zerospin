import { createRequire } from 'node:module';

import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import { config as loadEnv } from 'dotenv';
import * as Config from 'effect/Config';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';

import { loadZerospinProject } from '../deploy/loadZerospinConfigFn.js';

import { loadWranglerDevelopmentAdapter } from './WranglerDevelopmentAdapter.js';

const require = createRequire(import.meta.url);

export const loadDevelopmentProject = Effect.fn('loadDevelopmentProject')(
  function* (portOption: number | undefined) {
    let port = portOption;
    if (
      port !== undefined &&
      (!Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'zerospin-dev-invalid-port',
          message:
            'Invalid development port. Expected an integer from 1 to 65535.',
        }),
      );
    }
    const cwd = process.cwd();
    const pathApi = yield* Path.Path;

    yield* Effect.sync(() => {
      loadEnv({ path: pathApi.join(cwd, '.env.local') });
      loadEnv({ path: pathApi.join(cwd, '.env') });
    });

    if (port === undefined) {
      const configuredPort = yield* Config.Port('ZEROSPIN_PORT').pipe(
        Config.option,
        Effect.mapError(cause =>
          makeZerospinError({
            code: 'zerospin-dev-invalid-port',
            message:
              'Invalid ZEROSPIN_PORT. Expected an integer from 1 to 65535.',
            cause: prettyUnknownFailure(cause),
          }),
        ),
      );
      port = Option.getOrUndefined(configuredPort);
    }

    const wrangler = yield* Effect.try({
      try: () => {
        return loadWranglerDevelopmentAdapter(cwd);
      },
      catch: cause =>
        makeZerospinError({
          code: 'zerospin-dev-wrangler-not-found',
          message:
            'Could not load the Wrangler development environment loader from the current project.',
          cause: prettyUnknownFailure(cause),
        }),
    });
    const wranglerBinPath = pathApi.join(
      pathApi.dirname(
        require.resolve('wrangler/package.json', { paths: [cwd] }),
      ),
      'bin',
      'wrangler.js',
    );
    const { config, ownerReleases } = yield* loadZerospinProject({
      cwd,
      resolveOwnerReleases: true,
    });
    const systemSpec = Schema.decodeUnknownSync(SystemSpecSchema)(
      makeSystemSpec({ system: config.system }),
    );
    const registryPath = process.env.WRANGLER_REGISTRY_PATH;
    const registry = registryPath
      ? pathApi.resolve(cwd, registryPath)
      : undefined;
    return {
      cwd,
      port,
      wrangler,
      wranglerBinPath,
      config,
      systemSpec,
      ownerReleases,
      registry,
    };
  },
);
