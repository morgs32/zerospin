import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
import { makeZerospinError, prettyUnknownFailure } from '@zerospin/error';
import * as Effect from 'effect/Effect';
import { build } from 'esbuild';

import { loadZerospinConfigFn } from '../deploy/loadZerospinConfigFn.js';

import { createStoredZip } from './createStoredZip.js';

const require = createRequire(import.meta.url);

/** Package the actual authored System and its portable metadata for the iOS host. */
export const packageSystem = Effect.fn('packageSystem')(function* () {
  const cwd = process.cwd();
  const config = yield* loadZerospinConfigFn(cwd);
  return yield* Effect.tryPromise({
    try: async () => {
      const systemSpec = makeSystemSpec({ system: config.system });
      const configPath = path.resolve(cwd, 'zerospin.config.ts');
      const runtimePath =
        require.resolve('@zerospin/native/createNativeSystem');
      const bundle = await build({
        stdin: {
          contents: `import config from ${JSON.stringify(configPath)};\nimport { createNativeSystem } from ${JSON.stringify(runtimePath)};\nglobalThis.ZerospinSystem = createNativeSystem(config.system);\n`,
          resolveDir: cwd,
          sourcefile: 'zerospin-system-entry.ts',
          loader: 'ts',
        },
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        conditions: ['workerd'],
        define: { 'process.env.NODE_ENV': '"production"' },
        write: false,
        logLevel: 'silent',
      });
      const output = bundle.outputFiles[0];
      if (output === undefined) {
        throw new Error('No System bundle was produced');
      }
      const bundleSha256 = createHash('sha256')
        .update(output.contents)
        .digest('hex');
      const manifest = {
        formatVersion: 2,
        systemName: systemSpec.systemName,
        bundleSha256,
        systemSpecHash: systemSpec.hash,
      };
      const archive = createStoredZip({
        'manifest.json': Buffer.from(JSON.stringify(manifest), 'utf8'),
        'system.js': output.contents,
        'system-spec.json': Buffer.from(JSON.stringify(systemSpec), 'utf8'),
      });
      const directory = path.join(cwd, 'dist');
      const destination = path.join(directory, 'zerospin-system.zip');
      const temporary = path.join(
        directory,
        `.zerospin-system-${process.pid}.tmp`,
      );
      await mkdir(directory, { recursive: true });
      try {
        await writeFile(temporary, archive, { flag: 'wx' });
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
      return destination;
    },
    catch: cause =>
      makeZerospinError({
        code: 'unexpected-error',
        message: 'Could not package the iOS System.',
        cause: prettyUnknownFailure(cause),
      }),
  });
});
