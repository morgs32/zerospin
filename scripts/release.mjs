import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { releaseChangelog, releaseVersion } from 'nx/release';

const args = process.argv.slice(2);
const flags = new Set(['--dry-run', '--first-release']);
const specifiers = args.filter(arg => !flags.has(arg));
if (specifiers.length > 1 || specifiers.some(arg => arg.startsWith('-'))) {
  throw new Error(
    'Usage: pnpm release [version] [--dry-run] [--first-release]',
  );
}
const planDirectory = fileURLToPath(
  new URL('../.nx/version-plans/', import.meta.url),
);
const plans = existsSync(planDirectory) ? readdirSync(planDirectory) : [];
if (specifiers.length > 0 && plans.length > 0) {
  throw new Error('Apply pending version plans without an explicit version.');
}
if (specifiers.length === 0 && plans.length === 0) {
  console.log('No pending version plans.');
  process.exit(0);
}

const options = {
  groups: ['zerospin'],
  dryRun: args.includes('--dry-run'),
  firstRelease: args.includes('--first-release'),
  stageChanges: false,
  gitCommit: false,
  gitTag: false,
  gitPush: false,
};
const result = await releaseVersion({
  ...options,
  specifier: specifiers[0],
  deleteVersionPlans: false,
});
const versions = new Set(
  Object.values(result.projectsVersionData)
    .map(project => project.newVersion)
    .filter(Boolean),
);
if (versions.size > 1) throw new Error('The zerospin release must stay fixed.');
if (versions.size === 1) {
  await releaseChangelog({
    ...options,
    version: [...versions][0],
    versionData: result.projectsVersionData,
    releaseGraph: result.releaseGraph,
    createRelease: false,
    deleteVersionPlans: true,
  });
}
