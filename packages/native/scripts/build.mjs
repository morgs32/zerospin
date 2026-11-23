import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const swift = resolve(root, 'packages/swift');
const packagedSwift = resolve(root, 'packages/native/swift');
if (process.argv.includes('--package')) {
  await build({
    entryPoints: [resolve(root, 'packages/native/src/host.js')],
    outfile: resolve(swift, 'Sources/Zerospin/Resources/host.bundle.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'info',
  });
  await mkdir(packagedSwift, { recursive: true });
  await cp(
    resolve(swift, 'Package.swift'),
    resolve(packagedSwift, 'Package.swift'),
  );
  await rm(resolve(packagedSwift, 'Sources'), { recursive: true, force: true });
  await cp(resolve(swift, 'Sources'), resolve(packagedSwift, 'Sources'), {
    recursive: true,
  });
  process.exit(0);
}
const aliases = Object.fromEntries(
  [
    'core',
    'sdk',
    'shapes',
    'error',
    'logger',
    'browser',
    'native',
    'server-only',
  ].map(name => [`@zerospin/${name}`, resolve(root, `packages/${name}/src`)]),
);
await build({
  entryPoints: [resolve(root, 'examples/tic-tac-toe/src/nativeGameSession.ts')],
  outfile: resolve(root, 'packages/native/dist/tic-tac-toe.js'),
  bundle: true,
  format: 'iife',
  globalName: 'ZerospinApp',
  platform: 'browser',
  target: 'es2022',
  alias: aliases,
  metafile: true,
  logLevel: 'info',
});
