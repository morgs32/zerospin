import fs from 'node:fs/promises';
import path from 'node:path';

import {
  getOwnerReleaseWorkerName,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemConfig, ISystemSpec } from '@zerospin/core/system/types';
import {
  getOwnerReleaseDurableObjectClassNames,
  makeOwnerReleaseWranglerConfig,
  type makeWranglerConfig,
} from '@zerospin/dev-worker/makeWranglerConfig';
import type { IOwnerReleaseWorkerConfig } from '@zerospin/owner-release-worker/AggregateReleaseWorker';

import type {
  ILoadedOwnerRelease,
  IOwnerReleaseSource,
} from '../loadOwnerReleaseSources.js';

interface IOwnerReleaseEntrypoint {
  frameworkMain: string;
  source: IOwnerReleaseSource;
  release: IOwnerRelease;
  host: Pick<IOwnerReleaseWorkerConfig, 'systemId' | 'systemName'>;
}

export function readPredecessorRelease(
  systemSpec: ISystemSpec,
  release: IOwnerRelease,
) {
  if (!('aggregateName' in release)) return;
  const aggregate =
    systemSpec.aggregates[release.aggregateName]?.releases[
      release.aggregateVersion
    ];
  const predecessor = aggregate?.branchFrom ?? aggregate?.rebuildFrom;
  return predecessor === undefined
    ? undefined
    : {
        aggregateName: release.aggregateName,
        aggregateVersion: predecessor,
      };
}

export function makeOwnerReleaseEntrypoint({
  frameworkMain,
  source,
  release,
  host,
}: IOwnerReleaseEntrypoint) {
  const family = 'aggregateName' in release ? 'Aggregate' : 'Service';
  const factory = `make${family}ReleaseWorker`;
  const worker = `${family}ReleaseWorker`;
  const durableObjects =
    getOwnerReleaseDurableObjectClassNames(release).join(', ');
  return [
    "import { env } from 'cloudflare:workers';",
    `import { ${factory} } from ${JSON.stringify(frameworkMain)};`,
    `import { ${JSON.stringify(source.exportName)} as release } from ${JSON.stringify(source.modulePath)};`,
    `const { ${worker}, ${durableObjects} } = ${factory}(release, {`,
    `  systemId: ${JSON.stringify(host.systemId)},`,
    `  systemName: ${JSON.stringify(host.systemName)},`,
    '  systemSpecHash: env.ZEROSPIN_SYSTEM_SPEC_HASH,',
    '  telemetry: env.ZEROSPIN_TELEMETRY,',
    '});',
    `export default ${worker};`,
    `export { ${durableObjects} };`,
    '',
  ].join('\n');
}

/** Package the authored release with its host identity and catalog reference. */
export async function prepareOwnerReleaseWranglerConfig(
  props: ILoadedOwnerRelease & {
    directory: string;
    frameworkMain: string;
    stable: ReturnType<typeof makeWranglerConfig>;
    config: Pick<ISystemConfig, 'systemId' | 'wrangler'>;
  },
) {
  const { directory, frameworkMain, stable, config, release, source } = props;
  const workerName = getOwnerReleaseWorkerName(stable.name, release);
  const main = path.join(directory, workerName + '.js');
  await fs.writeFile(
    main,
    makeOwnerReleaseEntrypoint({
      frameworkMain,
      source,
      release,
      host: {
        systemId: config.systemId,
        systemName: stable.vars.ZEROSPIN_SYSTEM_NAME,
      },
    }),
    { mode: 0o600 },
  );
  return makeOwnerReleaseWranglerConfig({
    stable,
    release,
    main,
    application: config.wrangler,
  });
}
