import { execFileSync } from 'node:child_process';

import { ReleaseClient } from 'nx/release';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run')) {
  throw new Error('Usage: node scripts/publish-machine.mjs [--dry-run]');
}

execFileSync('pnpm', ['nx', 'run', '@zerospin/machine:lib'], {
  stdio: 'inherit',
});

// Publish this new package without changing the workspace's fixed version group.
const client = new ReleaseClient({ projects: ['@zerospin/machine'] }, true);
const result = await client.releasePublish({
  projects: ['@zerospin/machine'],
  registry: 'http://127.0.0.1:4873/',
  dryRun: args.includes('--dry-run'),
});
if (
  Object.keys(result).length !== 1 ||
  result['@zerospin/machine']?.code !== 0
) {
  throw new Error(`Machine publication failed: ${JSON.stringify(result)}`);
}
