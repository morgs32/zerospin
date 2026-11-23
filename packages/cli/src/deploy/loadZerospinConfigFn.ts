import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { ISystemConfig } from '@zerospin/core/system/types';
import { ZerospinConfigSchema } from '@zerospin/core/system/ZerospinConfigSchema';
import {
  isZerospinError,
  makeZerospinError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import * as Effect from 'effect/Effect';
import * as FileSystem from 'effect/FileSystem';
import * as Path from 'effect/Path';
import * as Schema from 'effect/Schema';
import { createJiti } from 'jiti';

import { jitiAliasesFromTsconfigPaths } from './jitiAliasesFromTsconfigPaths.js';
import {
  loadOwnerReleaseSources,
  type ILoadedOwnerRelease,
} from './loadOwnerReleaseSources.js';

interface ILoadedZerospinProject {
  config: ISystemConfig;
  ownerReleases: readonly ILoadedOwnerRelease[];
}

/** Import the exact root configuration without running a typechecker or seeds. */
export const loadZerospinProject = Effect.fn('loadZerospinProject')(function* ({
  cwd = process.cwd(),
  resolveOwnerReleases = false,
}: {
  cwd?: string;
  resolveOwnerReleases?: boolean;
}): Effect.fn.Return<
  ILoadedZerospinProject,
  IAnyError,
  FileSystem.FileSystem | Path.Path
> {
  const pathApi = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const configPath = pathApi.resolve(cwd, 'zerospin.config.ts');
  return yield* Effect.gen(function* () {
    // An explicit existence check prevents jiti from trying other extensions.
    if (!(yield* fileSystem.exists(configPath))) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'deploy-invalid-config',
          message: `Missing project configuration: ${configPath}.`,
        }),
      );
    }
    const alias = yield* jitiAliasesFromTsconfigPaths(cwd);
    const jiti = createJiti(configPath, {
      alias,
      moduleCache: false,
      tryNative: false,
    });
    const { loadedModule, loadModule } = yield* Effect.tryPromise({
      try: async () => {
        if (!resolveOwnerReleases) {
          return { loadedModule: await jiti.import<unknown>(configPath) };
        }
        // The evaluated module gives config and source imports one module cache.
        // A new CLI load gets a fresh graph even after editing an authored file.
        const loader: unknown = await jiti.evalModule(
          'export const load = async modulePath => import(modulePath);',
          {
            filename: configPath + '.load.ts',
            async: true,
            forceTranspile: true,
          },
        );
        if (
          typeof loader !== 'object' ||
          loader === null ||
          !('load' in loader) ||
          typeof loader.load !== 'function'
        ) {
          throw new Error(
            'Could not create a shared configuration module loader',
          );
        }
        const load = loader.load;
        const loadModule = async (modulePath: string): Promise<unknown> =>
          load(modulePath);
        return { loadedModule: await loadModule(configPath), loadModule };
      },
      catch: cause =>
        makeZerospinError({
          code: 'deploy-invalid-config',
          message: `Failed to load ${configPath}.`,
          cause: prettyUnknownFailure(cause),
        }),
    });
    const { default: config } = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ default: ZerospinConfigSchema }),
    )(loadedModule, { onExcessProperty: 'ignore' }).pipe(
      Effect.mapError(cause => {
        const schemaModule = '@zerospin/core/system/ZerospinConfigSchema';
        const cliCore = fileURLToPath(import.meta.resolve(schemaModule));
        const projectRequire = createRequire(configPath);
        let projectCore: string;
        try {
          const sdk = projectRequire.resolve('@zerospin/sdk');
          projectCore = createRequire(sdk).resolve(schemaModule);
        } catch {
          try {
            projectCore = projectRequire.resolve(schemaModule);
          } catch {
            return cause;
          }
        }
        if (cliCore === projectCore) return cause;

        return makeZerospinError({
          code: 'deploy-invalid-config',
          message:
            `Failed to validate ${configPath}. The Zerospin CLI and project resolve different copies of @zerospin/core. ` +
            'Run the project-installed CLI from the directory containing zerospin.config.ts (for example, pnpm exec zerospin dev).',
          cause: `CLI: ${cliCore}\nProject: ${projectCore}\n${prettyUnknownFailure(cause)}`,
        });
      }),
    );
    const ownerReleases =
      loadModule === undefined
        ? []
        : yield* Effect.tryPromise({
            try: () =>
              loadOwnerReleaseSources({
                system: config.system,
                declarations:
                  loadedModule !== null &&
                  typeof loadedModule === 'object' &&
                  Object.hasOwn(loadedModule, 'ownerReleaseSources')
                    ? Reflect.get(loadedModule, 'ownerReleaseSources')
                    : undefined,
                configPath,
                resolveModule: modulePath =>
                  fileURLToPath(jiti.esmResolve(modulePath)),
                loadModule,
              }),
            catch: cause =>
              isZerospinError(cause)
                ? cause
                : makeZerospinError({
                    code: 'deploy-invalid-config',
                    message: `Failed to read ownerReleaseSources from ${configPath}.`,
                    cause: prettyUnknownFailure(cause),
                  }),
          });
    return { config, ownerReleases };
  }).pipe(
    Effect.mapError(cause =>
      isZerospinError(cause)
        ? cause
        : makeZerospinError({
            code: 'deploy-invalid-config',
            message: `Failed to load ${configPath}.`,
            cause: prettyUnknownFailure(cause),
          }),
    ),
  );
});

export function loadZerospinConfigFn(cwd?: string) {
  return loadZerospinProject({ cwd }).pipe(Effect.map(({ config }) => config));
}
