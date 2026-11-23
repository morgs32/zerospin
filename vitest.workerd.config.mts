import { existsSync, globSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cloudflareTest } from '@cloudflare/vitest-plugin';
import type {
  AggregateAgentNodeRepo,
  ServiceAgentNodeRepo,
} from '@zerospin/agent-worker/AgentNodeRepos';
import {
  getOwnerReleaseBindingName,
  getOwnerReleaseWorkerName,
  PREPARE_AGGREGATE_REPLAY_PATH,
  PREPARE_SERVICE_REPLAY_PATH,
  RUN_OWNER_OPERATION_PATH,
  type IOwnerRelease,
  type IOwnerReleaseIdentity,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type { ISystemSpec } from '@zerospin/core/system/types';
import { getOwnerReleaseDurableObjectClassNames } from '@zerospin/dev-worker/makeWranglerConfig';
import type {
  IAggregateVersionRepoInstance,
  IServiceVersionRepoInstance,
} from '@zerospin/owner-release-worker/VersionRepos';
import { build } from 'esbuild';
import { defineProject } from 'vitest/config';

// oxlint-disable-next-line eslint/no-restricted-imports -- Build pinned fixtures with the production CLI entrypoint generator.
import {
  makeOwnerReleaseEntrypoint,
  readPredecessorRelease,
} from './packages/cli/src/deploy/utils/writeOwnerReleaseEntrypoint.ts';

declare global {
  namespace Cloudflare {
    // Test bindings expose the concrete classes in their owning Worker.
    interface Env {
      AGGREGATE_AGENT_NODE_REPO: DurableObjectNamespace<AggregateAgentNodeRepo>;
      SERVICE_AGENT_NODE_REPO: DurableObjectNamespace<ServiceAgentNodeRepo>;
      AGGREGATE_VERSION_REPO: DurableObjectNamespace<IAggregateVersionRepoInstance>;
      SERVICE_VERSION_REPO: DurableObjectNamespace<
        Omit<IServiceVersionRepoInstance, 'executeCommandSubscriber'>
      >;
    }
  }
}

const specPaths = globSync(
  'packages/system-worker/tests/**/*.workerd.spec.ts',
).toSorted();

const systemWorker = './packages/production-worker/src/SystemWorker.ts';
const agentMain = './packages/agent-worker/src/AgentWorker.ts';
const aggregateOwnerMain =
  './packages/owner-release-worker/src/AggregateReleaseWorker.ts';
const serviceOwnerMain =
  './packages/owner-release-worker/src/ServiceReleaseWorker.ts';

const rootRepos = new Set(['SystemRepo', 'AggregateChain', 'ServiceChain']);

interface IFixtureRelease {
  release: IOwnerRelease;
  source: string;
  exportName: string;
}

interface IFixturePlacement {
  releases: readonly IFixtureRelease[];
  runner: 'system' | 'agent' | IOwnerRelease;
  pauseServiceOriginals?: true;
  manualServiceProjection?: true;
}

function serviceRelease(
  serviceName: string,
  serviceVersion: number,
  source: string,
  exportName: string,
): IFixtureRelease {
  return { release: { serviceName, serviceVersion }, source, exportName };
}

function aggregateRelease(
  aggregateName: string,
  aggregateVersion: number,
  source: string,
  exportName: string,
): IFixtureRelease {
  return { release: { aggregateName, aggregateVersion }, source, exportName };
}

const nativeAccount = aggregateRelease(
  'account',
  1,
  'accountV1.ts',
  'accountV1',
);
const nativeReservations = serviceRelease(
  'reservations',
  1,
  'reservationsV1.ts',
  'reservationsV1',
);
const nativeReleases = [
  nativeAccount,
  nativeReservations,
  aggregateRelease(
    'agentAccount',
    1,
    '../declarations/aggregates/agentAccountV1.ts',
    'agentAccountV1',
  ),
  serviceRelease(
    'agentReservations',
    1,
    '../declarations/services/agentReservationsV1.ts',
    'agentReservationsV1',
  ),
];
const adapterAccountV1 = aggregateRelease(
  'account',
  1,
  'accountV1.ts',
  'accountV1',
);
const adapterAccountV2 = aggregateRelease(
  'account',
  2,
  'accountV2.ts',
  'accountV2',
);
const gameV1 = aggregateRelease(
  'game',
  1,
  '../../../../examples/tic-tac-toe/src/gameAggregateReleaseV1.ts',
  'aggregateRelease',
);
const gameV2 = aggregateRelease(
  'game',
  2,
  '../../../../examples/tic-tac-toe/src/gameAggregateReleaseV2.ts',
  'gameReleaseV2',
);
const gameV3 = aggregateRelease(
  'game',
  3,
  '../../../../examples/tic-tac-toe/src/gameAggregateReleaseV3.ts',
  'gameReleaseV3',
);
const aggregateAdapterReleases = [
  adapterAccountV1,
  adapterAccountV2,
  gameV1,
  gameV2,
  gameV3,
];
const aggregateHistoryRelease = aggregateRelease(
  'account',
  1,
  '../declarations/aggregates/accountV1.ts',
  'accountV1',
);
const aggregateTimeRelease = (version: number) =>
  aggregateRelease('account', version, 'system.ts', 'accountV' + version);
const aggregateTimeReleases = [1, 2, 3, 4, 5, 6].map(aggregateTimeRelease);

const queryRelease = serviceRelease(
  'reservations',
  1,
  'reservationsV1.ts',
  'reservationsV1',
);
const materializationRelease = serviceRelease(
  'reservations',
  1,
  '../declarations/services/reservationWorkV1.ts',
  'reservationWorkV1',
);
const replayParallelRelease = serviceRelease(
  'reservations',
  2,
  'reservationsV2.ts',
  'reservationsV2',
);
const replayReleases = [materializationRelease, replayParallelRelease];
const historyRelease = serviceRelease(
  'reservations',
  1,
  '../declarations/services/reservationsV1.ts',
  'reservationsV1',
);
const lifecycleAggregate = aggregateRelease(
  'account',
  1,
  '../declarations/aggregates/accountV1.ts',
  'accountV1',
);
const lifecycleService = serviceRelease(
  'reservations',
  1,
  'reservationsV1.ts',
  'reservationsV1',
);
const lifecycleReleases = [
  lifecycleAggregate,
  lifecycleService,
  aggregateRelease(
    'agentAccount',
    1,
    '../declarations/aggregates/agentAccountV1.ts',
    'agentAccountV1',
  ),
  serviceRelease('reservations', 2, 'reservationsV2.ts', 'reservationsV2'),
  serviceRelease(
    'agentReservations',
    1,
    '../declarations/services/agentReservationsV1.ts',
    'agentReservationsV1',
  ),
  serviceRelease(
    'dispatcher',
    1,
    '../declarations/services/dispatcherV1.ts',
    'dispatcherV1',
  ),
];

const serviceAdapterV1 = serviceRelease(
  'reservations',
  1,
  '../declarations/services/reservationsV1.ts',
  'reservationsV1',
);
const serviceAdapterV2 = serviceRelease(
  'reservations',
  2,
  'reservationsV2.ts',
  'reservationsV2',
);
const serviceAdapterReleases = [serviceAdapterV1, serviceAdapterV2];
const publicationReleases = [
  queryRelease,
  serviceRelease('reservations', 2, 'reservationsV2.ts', 'reservationsV2'),
];

const subscriberHistoryV1 = serviceRelease(
  'reservations',
  1,
  'reservationsV1.ts',
  'reservationsV1',
);
const subscriberHistoryV2 = serviceRelease(
  'reservations',
  2,
  'reservationsV2.ts',
  'reservationsV2',
);
const subscriberHistoryReleases = [subscriberHistoryV1, subscriberHistoryV2];
const projectionService = serviceRelease(
  'reservations',
  1,
  '../declarations/services/reservationsV1.ts',
  'reservationsV1',
);
const projectionReleases = [
  aggregateRelease('account', 1, 'accountV1.ts', 'accountV1'),
  projectionService,
];
const splitAgentReleases = [
  serviceRelease(
    'agentReservations',
    1,
    '../declarations/services/agentReservationsV1.ts',
    'agentReservationsV1',
  ),
  serviceRelease(
    'agentReservations',
    2,
    'agentReservationsV2.ts',
    'agentReservationsV2',
  ),
];
const aggregateAgentReleases = [
  aggregateRelease(
    'agentAccount',
    1,
    '../declarations/aggregates/agentAccountV1.ts',
    'agentAccountV1',
  ),
  aggregateRelease('agentAccount', 2, 'agentAccountV2.ts', 'agentAccountV2'),
];
const fixturePlacements: Readonly<
  Record<string, IFixturePlacement | undefined>
> = {
  'native-system-api': { releases: nativeReleases, runner: 'system' },
  'native-system-api-aggregate': {
    releases: nativeReleases,
    runner: nativeAccount.release,
  },
  'native-system-api-service': {
    releases: nativeReleases,
    runner: nativeReservations.release,
  },
  'native-system-api-agent': { releases: nativeReleases, runner: 'agent' },
  'aggregate-adapter-failures': {
    releases: aggregateAdapterReleases,
    runner: 'system',
  },
  'aggregate-adapter-account-v1': {
    releases: aggregateAdapterReleases,
    runner: adapterAccountV1.release,
  },
  'aggregate-adapter-account-v2': {
    releases: aggregateAdapterReleases,
    runner: adapterAccountV2.release,
  },
  'aggregate-adapter-game-replay': {
    releases: aggregateAdapterReleases,
    runner: gameV2.release,
  },
  'aggregate-adapter-game-finished': {
    releases: aggregateAdapterReleases,
    runner: gameV3.release,
  },
  'aggregate-history-fanout': {
    releases: [aggregateHistoryRelease],
    runner: aggregateHistoryRelease.release,
  },
  'aggregate-history-fanout-root': {
    releases: [aggregateHistoryRelease],
    runner: 'system',
  },
  'service-time': {
    releases: publicationReleases,
    runner: queryRelease.release,
  },
  'service-time-replay-clock': {
    releases: publicationReleases,
    runner: publicationReleases[1]!.release,
  },
  'aggregate-time': { releases: aggregateTimeReleases, runner: 'system' },
  'aggregate-time-v2': {
    releases: aggregateTimeReleases,
    runner: aggregateTimeRelease(2).release,
  },
  'aggregate-time-v3': {
    releases: aggregateTimeReleases,
    runner: aggregateTimeRelease(3).release,
  },
  'aggregate-time-v4': {
    releases: aggregateTimeReleases,
    runner: aggregateTimeRelease(4).release,
  },
  'aggregate-time-v5': {
    releases: aggregateTimeReleases,
    runner: aggregateTimeRelease(5).release,
  },
  'aggregate-time-v6': {
    releases: aggregateTimeReleases,
    runner: aggregateTimeRelease(6).release,
  },
  'service-queries': { releases: [queryRelease], runner: queryRelease.release },
  'alarm-registries': {
    releases: [
      serviceRelease(
        'dispatcher',
        1,
        '../declarations/services/dispatcherV1.ts',
        'dispatcherV1',
      ),
    ],
    runner: 'system',
  },
  'agent-node-service': { releases: splitAgentReleases, runner: 'agent' },
  'agent-node-service-split': {
    releases: splitAgentReleases,
    runner: 'system',
  },
  'agent-node-aggregate': { releases: aggregateAgentReleases, runner: 'agent' },
  'service-projections': {
    releases: projectionReleases,
    runner: projectionService.release,
  },
  'service-projections-agent': {
    releases: projectionReleases,
    runner: 'agent',
    manualServiceProjection: true,
  },
  'service-adapter-failures': {
    releases: serviceAdapterReleases,
    runner: serviceAdapterV2.release,
  },
  'service-adapter-failures-v1': {
    releases: serviceAdapterReleases,
    runner: serviceAdapterV1.release,
  },
  'service-replay': {
    releases: replayReleases,
    runner: materializationRelease.release,
  },
  'service-replay-historical': {
    releases: replayReleases,
    runner: replayParallelRelease.release,
  },
  'service-materialization': {
    releases: [materializationRelease],
    runner: materializationRelease.release,
  },
  'service-publication': {
    releases: publicationReleases,
    runner: 'system',
    pauseServiceOriginals: true,
  },
  'service-publication-v1': {
    releases: publicationReleases,
    runner: queryRelease.release,
  },
  'service-actor-connections': {
    releases: publicationReleases,
    runner: queryRelease.release,
  },
  'service-actor-prefix': {
    releases: [queryRelease],
    runner: queryRelease.release,
  },
  'service-history-subscribers': {
    releases: subscriberHistoryReleases,
    runner: subscriberHistoryV1.release,
  },
  'service-history-subscribers-v2': {
    releases: subscriberHistoryReleases,
    runner: subscriberHistoryV2.release,
  },
  'service-history-fanout': {
    releases: [historyRelease],
    runner: historyRelease.release,
  },
  'chain-command-delivery': {
    releases: [
      aggregateRelease('account', 1, 'accountV1.ts', 'accountV1'),
      aggregateRelease('account', 2, 'accountV2.ts', 'accountV2'),
      serviceRelease('dispatcher', 1, 'dispatcherV1.ts', 'dispatcherV1'),
      serviceRelease('reservations', 2, 'reservationsV2.ts', 'reservationsV2'),
    ],
    runner: 'system',
  },
  'repo-lifecycle': { releases: lifecycleReleases, runner: 'system' },
  'repo-lifecycle-aggregate': {
    releases: lifecycleReleases,
    runner: lifecycleAggregate.release,
  },
  'repo-lifecycle-service': {
    releases: lifecycleReleases,
    runner: lifecycleService.release,
  },
  'service-command-admission': { releases: [historyRelease], runner: 'system' },
  'service-external-settlement': {
    releases: [historyRelease],
    runner: 'system',
  },
  'service-external-delivery': {
    releases: publicationReleases,
    runner: 'system',
  },
};

const workerOptions = {
  compatibilityDate: '2026-10-19',
  compatibilityFlags: ['nodejs_compat'],
  bindings: {
    ZEROSPIN_SYSTEM_ID: 'sys_servicePublication',
    ZEROSPIN_ENVIRONMENT: 'dev',
    ZEROSPIN_PUBLISHABLE_KEY: 'pk_dev',
    ZEROSPIN_SECRET_KEY: 'sk_dev',
  },
  durableObjects: {
    AGGREGATE_CHAIN: { className: 'AggregateChain', useSQLite: true },
    AGGREGATE_ACTOR_VERSION_CHAIN: {
      className: 'AggregateActorVersionChain',
      useSQLite: true,
    },
    AGGREGATE_ACTOR_VERSION_REPO: {
      className: 'AggregateActorVersionRepo',
      useSQLite: true,
    },
    AGGREGATE_VERSION_REPO: {
      className: 'AggregateVersionRepo',
      useSQLite: true,
    },
    AGGREGATE_VERSION_CHAIN: {
      className: 'AggregateVersionChain',
      useSQLite: true,
    },
    AGGREGATE_ACTOR_VERSION_ARCHIVE: {
      className: 'AggregateActorVersionArchive',
      useSQLite: true,
    },
    AGGREGATE_VERSION_ARCHIVE: {
      className: 'AggregateVersionArchive',
      useSQLite: true,
    },
    SERVICE_AGENT_NODE_REPO: {
      className: 'ServiceAgentNodeRepo',
      useSQLite: true,
    },
    SERVICE_AGENT_VERSION_REPO: {
      className: 'ServiceAgentVersionRepo',
      useSQLite: true,
    },
    SERVICE_AGENT_VERSION_CHAIN: {
      className: 'ServiceAgentVersionChain',
      useSQLite: true,
    },
    AGGREGATE_AGENT_NODE_REPO: {
      className: 'AggregateAgentNodeRepo',
      useSQLite: true,
    },
    AGGREGATE_AGENT_VERSION_REPO: {
      className: 'AggregateAgentVersionRepo',
      useSQLite: true,
    },
    AGGREGATE_AGENT_VERSION_CHAIN: {
      className: 'AggregateAgentVersionChain',
      useSQLite: true,
    },
    SYSTEM_REPO: { className: 'SystemRepo', useSQLite: true },
    SERVICE_CHAIN: { className: 'ServiceChain', useSQLite: true },
    SERVICE_VERSION_REPO: {
      className: 'ServiceVersionRepo',
      useSQLite: true,
    },
    SERVICE_VERSION_CHAIN: {
      className: 'ServiceVersionChain',
      useSQLite: true,
    },
    SERVICE_ACTOR_VERSION_ARCHIVE: {
      className: 'ServiceActorVersionArchive',
      useSQLite: true,
    },
    SERVICE_VERSION_ARCHIVE: {
      className: 'ServiceVersionArchive',
      useSQLite: true,
    },
    SERVICE_ACTOR_VERSION_REPO: {
      className: 'ServiceActorVersionRepo',
      useSQLite: true,
    },
    SERVICE_ACTOR_VERSION_CHAIN: {
      className: 'ServiceActorVersionChain',
      useSQLite: true,
    },
  },
};

type IRepoBinding = {
  className: string;
  useSQLite: boolean;
  scriptName?: string;
};

const projectVariants: Readonly<Record<string, readonly string[] | undefined>> =
  {
    'agent-node-service': ['agent-node-service-split'],
    'aggregate-adapter-failures': [
      'aggregate-adapter-failures-pinned',
      'aggregate-adapter-account-v1',
      'aggregate-adapter-account-v2',
      'aggregate-adapter-game-replay',
      'aggregate-adapter-game-finished',
    ],
    'aggregate-history-fanout': ['aggregate-history-fanout-root'],
    'aggregate-time': [
      'aggregate-time-v2',
      'aggregate-time-v3',
      'aggregate-time-v4',
      'aggregate-time-v5',
      'aggregate-time-v6',
    ],
    'native-system-api': [
      'native-system-api-aggregate',
      'native-system-api-service',
      'native-system-api-agent',
    ],
    'repo-lifecycle': ['repo-lifecycle-aggregate', 'repo-lifecycle-service'],
    'service-adapter-failures': ['service-adapter-failures-v1'],
    'service-external-delivery': ['service-external-delivery-pinned'],
    'service-history-subscribers': ['service-history-subscribers-v2'],
    'service-projections': ['service-projections-agent'],
    'service-publication': [
      'service-publication-v1',
      'service-publication-pinned',
    ],
    'service-replay': ['service-replay-historical'],
    'service-time': ['service-time-replay-clock'],
  };

const isolateTestPatterns: Readonly<Record<string, RegExp | undefined>> = {
  'agent-node-service-split':
    /Agent wake delivery|retains one hosted admission receipt/u,
  'aggregate-adapter-account-v1':
    /records the ordinary continuation|payload adaptation during/u,
  'aggregate-adapter-account-v2':
    /retains Aggregate support refusals|retains an evaluated Aggregate/u,
  'aggregate-adapter-failures': /Aggregate external operation outbox/u,
  'aggregate-adapter-failures-pinned':
    /across independently pinned Aggregate owner Workers/u,
  'aggregate-adapter-game-finished': /saves finished Games/u,
  'aggregate-adapter-game-replay': /replays saved Game positions/u,
  'aggregate-history-fanout':
    /^(?!.*initializes AggregateChain with one progress table).*$/u,
  'aggregate-history-fanout-root':
    /initializes AggregateChain with one progress table/u,
  'aggregate-time':
    /pins simultaneous branches|finishes an original addressed/u,
  'aggregate-time-v2':
    /recovers interrupted branch publication|freezes Aggregate adapters/u,
  'aggregate-time-v3': /applies a server extension/u,
  'aggregate-time-v4':
    /replays an originating extension|replays only extensions/u,
  'aggregate-time-v5': /allows replay to succeed/u,
  'aggregate-time-v6':
    /evaluates both declared extensions|decodes source JSON once/u,
  'native-system-api':
    /reports escaping|reports a native|Native typed SystemApi/u,
  'native-system-api-agent':
    /forwards retained Aggregate and Agent admissions/u,
  'native-system-api-aggregate':
    /forwards retained Aggregate and Agent admissions|preserves authenticated Aggregate identity|preserves actual authorization command backpressure/u,
  'native-system-api-service': /preserves Service authentication-none claims/u,
  'repo-lifecycle':
    /^(?!.*(?:AggregateVersionRepo construction failure|PartyServer Actor alarm)).*$/u,
  'repo-lifecycle-aggregate': /AggregateVersionRepo construction failure/,
  'repo-lifecycle-service': /PartyServer Actor alarm/,
  'service-adapter-failures':
    /retains Service support refusals|retains an evaluated Service/u,
  'service-adapter-failures-v1': /payload adaptation during/u,
  'service-external-delivery-pinned': /pinned/iu,
  'service-history-subscribers':
    /^(?!.*(?:materializes a separate release view|starts future release projections)).*$/u,
  'service-history-subscribers-v2':
    /materializes a separate release view|starts future release projections/u,
  'service-projections': /^(?!.*agent projection commits resources).*$/u,
  'service-projections-agent': /agent projection commits resources/u,
  'service-publication':
    /^(?!.*retries a lost publication reply after ServiceVersionRepo eviction).*$/u,
  'service-publication-pinned': /pinned/iu,
  'service-publication-v1':
    /retries a lost publication reply after ServiceVersionRepo eviction/u,
  'service-replay': /restores remote retained output/u,
  'service-replay-historical': /materializes retained V1/u,
  'service-time': /replays expired reservations/u,
  'service-time-replay-clock': /freezes Service evaluation/u,
};

export const workerdProjects = specPaths.flatMap(specPath => {
  const name = basename(specPath, '.workerd.spec.ts');
  return [name, ...(projectVariants[name] ?? [])].map(project =>
    workerdProject(specPath, project),
  );
});

function workerdProject(specPath: string, name: string) {
  const configPath = join(dirname(specPath), 'system.ts');
  if (!existsSync(configPath)) {
    throw new Error(`Missing Workerd System: ${configPath}`);
  }
  const placement = fixturePlacements[name];
  const pattern = isolateTestPatterns[name];
  const pinnedAggregate = name === 'aggregate-adapter-failures-pinned';
  const pinnedService =
    name === 'service-external-delivery-pinned' ||
    name === 'service-publication-pinned';
  if (placement === undefined && !pinnedAggregate && !pinnedService) {
    throw new Error('Missing Workerd owner placement for ' + name);
  }
  const runner = placement?.runner ?? 'system';
  const workerMain = resolve(
    runner === 'system'
      ? systemWorker
      : runner === 'agent'
        ? agentMain
        : 'aggregateName' in runner
          ? aggregateOwnerMain
          : serviceOwnerMain,
  );
  let setup = '';
  return defineProject({
    resolve: {
      alias: [
        {
          find: 'config',
          replacement: fileURLToPath(
            new URL(`./${configPath}`, import.meta.url),
          ),
        },
        {
          // Use the same module identity as the declaration schema's relative import.
          find: /^@zerospin\/core\/agent\/(make(?:Aggregate|Service)AgentRelease)$/,
          replacement: fileURLToPath(
            new URL('./packages/core/src/agent/$1.ts', import.meta.url),
          ),
        },
        {
          find: /^@zerospin\/core\/(.*)$/,
          replacement: fileURLToPath(
            new URL('./packages/core/src/$1', import.meta.url),
          ),
        },
        {
          // The runner and Workerd assertions share the same class prototypes.
          find: /^@zerospin\/(agent-worker|dev-worker|owner-release-worker)\/(.*)$/,
          replacement: fileURLToPath(
            new URL('./packages/$1/src/$2.ts', import.meta.url),
          ),
        },
        ...['shapes', 'error', 'logger'].map(name => ({
          find: `@zerospin/${name}`,
          replacement: fileURLToPath(
            new URL(`./packages/${name}/src/index.ts`, import.meta.url),
          ),
        })),
      ],
    },
    plugins: [
      {
        name: 'zerospin-workerd-entrypoint',
        transform(source, id) {
          return id === workerMain ? source + '\n' + setup : undefined;
        },
      },
      cloudflareTest(async () => {
        const fixture =
          placement !== undefined
            ? await makeFixturePlacement(configPath, name, placement)
            : pinnedAggregate
              ? await pinnedAggregateWorkers(configPath, name)
              : await pinnedServiceWorkers(configPath, name);
        setup = fixture.setup;
        return { main: workerMain, miniflare: fixture.miniflare };
      }),
    ],
    test: {
      name: `workerd/${name}`,
      // Fetch modules individually: the pool expands Vitest's warm graph into one WebSocket frame.
      fsModuleCache: false,
      include: [specPath],
      ...(pattern === undefined ? {} : { testNamePattern: pattern }),
    },
  });
}

function selectNamespaces(predicate: (className: string) => boolean) {
  return Object.fromEntries(
    Object.entries(workerOptions.durableObjects).filter(([, binding]) =>
      predicate(binding.className),
    ),
  );
}

function bindNamespaces(
  namespaces: Record<string, IRepoBinding>,
  scriptName: string,
) {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, binding]) => [
      name,
      { ...binding, scriptName },
    ]),
  );
}

function runnerName(project: string) {
  return 'vitest-plugin-runner-workerd_' + project;
}

async function makeFixturePlacement(
  configPath: string,
  project: string,
  {
    releases,
    runner,
    pauseServiceOriginals,
    manualServiceProjection,
  }: IFixturePlacement,
) {
  const { compatibilityDate, compatibilityFlags, bindings } = workerOptions;
  const common = { compatibilityDate, compatibilityFlags, modules: true };
  const rootNamespaces = selectNamespaces(className =>
    rootRepos.has(className),
  );
  const runnerWorker = runnerName(project);
  const systemName = runner === 'system' ? runnerWorker : 'test-system';
  const { host: system, systemSpec: spec } =
    await compileFixtureSystem(configPath);
  const releasesWithHosts = releases.map(source => ({
    ...source,
    host: system,
    binding: getOwnerReleaseBindingName(source.release),
  }));
  const agentName =
    Object.keys(spec.aggregateAgents).length ||
    Object.keys(spec.serviceAgents).length
      ? runner === 'agent'
        ? runnerWorker
        : 'test-agent'
      : undefined;
  const agentNamespaces = selectNamespaces(className =>
    className.includes('Agent'),
  );
  const runnerRelease =
    typeof runner === 'object' ? getOwnerReleaseBindingName(runner) : undefined;
  const owners = releasesWithHosts.map(owner => ({
    ...owner,
    name:
      owner.binding === runnerRelease
        ? runnerWorker
        : getOwnerReleaseWorkerName('test-system', owner.release),
    sourcePath: resolve(dirname(configPath), owner.source),
  }));
  const ownerBindings = Object.fromEntries(
    owners.map(({ binding, name }) => [binding, name]),
  );
  const ownerReleases = owners.map(owner => ({
    systemId: system.systemId,
    release: owner.release,
    versionId: owner.name,
    specHash: spec.hash,
  }));
  const snapshot = JSON.stringify({ spec, ownerReleases });
  const instrumentedAgent =
    project === 'agent-node-aggregate' || project === 'agent-node-service';
  const setupServingSystem = [
    "import { configureServingSystemSpec as configureFixtureSnapshot } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';",
    `configureFixtureSnapshot(${JSON.stringify(snapshot)});`,
  ].join('\n');
  const externalDelivery = project === 'service-external-delivery';
  const externalDeliveryTestWorkers = resolve(
    dirname(configPath),
    'externalDeliveryTestWorkers.ts',
  );
  const externalDeliveryOlder = externalDelivery
    ? owners.find(
        ({ release }) =>
          'serviceVersion' in release && release.serviceVersion === 1,
      )
    : undefined;
  const externalDeliveryNewer = externalDelivery
    ? owners.find(
        ({ release }) =>
          'serviceVersion' in release && release.serviceVersion === 2,
      )
    : undefined;
  if (externalDelivery && (!externalDeliveryOlder || !externalDeliveryNewer)) {
    throw new Error('Expected two Service releases for external delivery.');
  }
  const rootOptions = {
    ...common,
    bindings: {
      ...bindings,
      // The dispatcher in these continuation tests is an ordinary single-build Service.
      ...(project === 'chain-command-delivery'
        ? { ZEROSPIN_HOSTED_SERVICE_BUILDS: true }
        : {}),
      ZEROSPIN_SYSTEM_ID: system.systemId,
      ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1',
      ZEROSPIN_SYSTEM_NAME: system.systemName,
      ZEROSPIN_SYSTEM_SPEC_HASH: spec.hash,
      ZEROSPIN_VERSION_METADATA: { id: systemName },
    },
    durableObjects: {
      ...rootNamespaces,
      ...(externalDeliveryOlder !== undefined
        ? {
            EXTERNAL_DELIVERY_V1_REPO: {
              ...workerOptions.durableObjects.SERVICE_VERSION_REPO,
              className: 'ExternalDeliveryRepo',
              scriptName: externalDeliveryOlder.name,
            },
          }
        : {}),
      ...(project === 'service-publication'
        ? bindNamespaces(
            {
              CUTOVER_SERVICE_VERSION_REPO:
                workerOptions.durableObjects.SERVICE_VERSION_REPO,
            },
            getOwnerReleaseWorkerName(
              'test-system',
              publicationReleases[1]!.release,
            ),
          )
        : {}),
      ...(agentName === undefined
        ? {}
        : bindNamespaces(agentNamespaces, agentName)),
    },
    serviceBindings: {
      ...ownerBindings,
      ...(agentName === undefined ? {} : { ZEROSPIN_AGENT_WORKER: agentName }),
      ...(externalDeliveryOlder && externalDeliveryNewer
        ? {
            EXTERNAL_DELIVERY_V1_CONTROL: {
              name: externalDeliveryOlder.name,
              entrypoint: 'ExternalDeliveryControls',
            },
            EXTERNAL_DELIVERY_V2_CONTROL: {
              name: externalDeliveryNewer.name,
              entrypoint: 'ExternalDeliveryControls',
            },
          }
        : {}),
    },
    r2Buckets:
      pauseServiceOriginals || externalDelivery
        ? ['BUCKET', 'PINNED_PROVIDER']
        : ['BUCKET'],
  };
  const agentOptions =
    agentName === undefined
      ? undefined
      : {
          ...common,
          bindings,
          durableObjects: {
            ...agentNamespaces,
            ...bindNamespaces(rootNamespaces, systemName),
            ...(project === 'native-system-api-agent'
              ? bindNamespaces(
                  {
                    NATIVE_TEST_SYSTEM_REPO:
                      workerOptions.durableObjects.SYSTEM_REPO,
                  },
                  systemName,
                )
              : {}),
            ...(instrumentedAgent
              ? bindNamespaces(
                  {
                    AGENT_TEST_SYSTEM_REPO:
                      workerOptions.durableObjects.SYSTEM_REPO,
                  },
                  systemName,
                )
              : {}),
          },
          serviceBindings: ownerBindings,
          r2Buckets: ['BUCKET'],
        };
  function ownerOptions(owner: (typeof owners)[number]) {
    const predecessor = readPredecessorRelease(spec, owner.release);
    const predecessorBinding =
      predecessor === undefined
        ? undefined
        : getOwnerReleaseBindingName(predecessor);
    const predecessorName =
      predecessorBinding === undefined
        ? undefined
        : ownerBindings[predecessorBinding];
    if (predecessorBinding !== undefined && predecessorName === undefined) {
      throw new Error('Missing fixture predecessor for ' + owner.binding);
    }
    const releaseClasses = new Set(
      getOwnerReleaseDurableObjectClassNames(owner.release),
    );
    return {
      ...common,
      bindings: {
        ...bindings,
        ZEROSPIN_SYSTEM_ID: system.systemId,
        ZEROSPIN_SYSTEM_SPEC_HASH: spec.hash,
        ZEROSPIN_OWNER_RELEASE: owner.release,
        ZEROSPIN_VERSION_METADATA: { id: owner.name },
      },
      durableObjects: {
        ...selectNamespaces(className => releaseClasses.has(className)),
        ...(project === 'service-materialization'
          ? {
              MATERIALIZATION_TEST_REPO:
                workerOptions.durableObjects.SERVICE_VERSION_REPO,
            }
          : {}),
        ...bindNamespaces(rootNamespaces, systemName),
        ...(agentName === undefined
          ? {}
          : bindNamespaces(agentNamespaces, agentName)),
      },
      serviceBindings:
        predecessorBinding === undefined || predecessorName === undefined
          ? {}
          : { [predecessorBinding]: predecessorName },
      r2Buckets:
        pauseServiceOriginals || externalDelivery
          ? ['BUCKET', 'PINNED_PROVIDER']
          : ['BUCKET'],
    };
  }

  const companionOwners = await Promise.all(
    owners
      .filter(owner => owner.name !== runnerWorker)
      .map(async owner => {
        const contents = makeOwnerReleaseEntrypoint({
          frameworkMain: resolve(
            'aggregateName' in owner.release
              ? aggregateOwnerMain
              : serviceOwnerMain,
          ),
          source: {
            modulePath: owner.sourcePath,
            exportName: owner.exportName,
          },
          release: owner.release,
          host: owner.host,
        });
        const options = ownerOptions(owner);
        if (owner === externalDeliveryOlder) {
          Object.assign(options.durableObjects, {
            SERVICE_VERSION_REPO: {
              ...workerOptions.durableObjects.SERVICE_VERSION_REPO,
              className: 'ExternalDeliveryRepo',
            },
          });
        }
        const gameWriter =
          project === 'aggregate-adapter-game-replay' &&
          'aggregateName' in owner.release &&
          owner.release.aggregateName === 'game' &&
          owner.release.aggregateVersion === 3;
        if (gameWriter) {
          Object.assign(options.durableObjects, {
            AGGREGATE_VERSION_REPO: {
              ...workerOptions.durableObjects.AGGREGATE_VERSION_REPO,
              className: 'GameReplayWriter',
            },
          });
        }
        return {
          ...options,
          name: owner.name,
          script: await bundleTestWorker(
            {
              contents:
                project === 'service-actor-connections'
                  ? `${contents}\nexport { HistoricalActorConnectionTestChain } from ${JSON.stringify(resolve(dirname(configPath), 'actorConnectionTestWorkers.ts'))};`
                  : gameWriter
                    ? `${contents}\nexport { GameReplayWriter } from ${JSON.stringify(resolve(dirname(configPath), 'gameReplayWriter.ts'))};`
                    : externalDelivery
                      ? contents +
                        '\n' +
                        `export { ExternalDeliveryControls${owner === externalDeliveryOlder ? ', ExternalDeliveryRepo' : ''} } from ${JSON.stringify(externalDeliveryTestWorkers)};`
                      : contents,
            },
            configPath,
            undefined,
            {
              ...(pauseServiceOriginals
                ? {
                    withOwnerFaults: true,
                    pauseServicePublication:
                      'serviceVersion' in owner.release &&
                      owner.release.serviceVersion === 2,
                    pauseServiceOriginals: true,
                  }
                : {}),
              ...(manualServiceProjection && 'serviceName' in owner.release
                ? { manualServiceProjection: true }
                : {}),
              ...(project === 'chain-command-delivery' &&
              'serviceName' in owner.release &&
              owner.release.serviceName === 'reservations'
                ? { gateDestinationOutcome: true }
                : {}),
              ...(project === 'service-replay'
                ? { observeServiceReplayFrom: owner.sourcePath }
                : {}),
              ...(project === 'aggregate-time' &&
              'aggregateVersion' in owner.release &&
              owner.release.aggregateVersion === 1
                ? { pauseAggregateTimePredecessor: true }
                : {}),
            },
          ),
          ...(project === 'service-actor-connections'
            ? {
                durableObjects: {
                  ...ownerOptions(owner).durableObjects,
                  SERVICE_ACTOR_VERSION_CHAIN: {
                    ...workerOptions.durableObjects.SERVICE_ACTOR_VERSION_CHAIN,
                    className: 'HistoricalActorConnectionTestChain',
                  },
                },
              }
            : {}),
        };
      }),
  );
  const companionAgent =
    agentOptions === undefined || agentName === undefined || runner === 'agent'
      ? []
      : [
          {
            ...agentOptions,
            name: agentName,
            script: await bundleTestWorker(agentMain, configPath),
          },
        ];
  if (runner === 'system') {
    return {
      setup: setupServingSystem,
      miniflare: {
        ...rootOptions,
        workers: [...companionOwners, ...companionAgent],
      },
    };
  }
  const actorConnectionWorkers = resolve(
    dirname(configPath),
    'actorConnectionTestWorkers.ts',
  );
  const systemScript = await bundleTestWorker(
    {
      contents: [
        setupServingSystem,
        project === 'aggregate-time-v2'
          ? aggregateTimeRootFixture()
          : `export { default } from ${JSON.stringify(resolve(systemWorker))};`,
        instrumentedAgent
          ? agentFixtureCatalog(ownerReleases, project === 'agent-node-service')
          : project === 'service-actor-connections'
            ? `export { ActorConnectionTestSystemRepo as SystemRepo } from ${JSON.stringify(actorConnectionWorkers)};`
            : `export { SystemRepo } from ${JSON.stringify(resolve(systemWorker))};`,
        project === 'agent-node-aggregate'
          ? aggregateAgentRootFaults()
          : project === 'aggregate-time-v2'
            ? ''
            : `export { AggregateChain } from ${JSON.stringify(resolve(systemWorker))};`,
        project === 'agent-node-service'
          ? serviceAgentRootFaults()
          : project === 'service-actor-connections'
            ? `export { ActorConnectionTestServiceChain as ServiceChain } from ${JSON.stringify(actorConnectionWorkers)};`
            : project === 'service-materialization'
              ? `
                import { ServiceChain as OwnerChain } from ${JSON.stringify(resolve(systemWorker))};
                export class ServiceChain extends OwnerChain {
                  async getServiceCommand(props) {
                    await this.env.BUCKET.put('service-materialization/command-read', String(props.serviceIndex));
                    return super.getServiceCommand(props);
                  }
                }
              `
              : `export { ServiceChain } from ${JSON.stringify(resolve(systemWorker))};`,
      ].join('\n'),
    },
    configPath,
  );
  const workers = [
    ...companionOwners,
    ...companionAgent,
    { ...rootOptions, name: systemName, script: systemScript },
  ];
  if (runner === 'agent') {
    if (agentOptions === undefined) {
      throw new Error('Expected an Agent fixture.');
    }
    return { setup: '', miniflare: { ...agentOptions, workers } };
  }

  const owner = owners.find(owner => owner.name === runnerWorker);
  if (owner === undefined) throw new Error('Missing instrumented release.');
  const options = ownerOptions(owner);
  if (project === 'aggregate-time-v2') {
    Object.assign(options.serviceBindings, {
      AGGREGATE_TIME_SYSTEM: systemName,
    });
    Object.assign(
      options.durableObjects,
      bindNamespaces(
        {
          AGGREGATE_TIME_CHAIN: workerOptions.durableObjects.AGGREGATE_CHAIN,
        },
        systemName,
      ),
    );
  }
  if (project === 'native-system-api-aggregate') {
    Object.assign(
      options.durableObjects,
      bindNamespaces(
        {
          NATIVE_TEST_SYSTEM_REPO: workerOptions.durableObjects.SYSTEM_REPO,
        },
        systemName,
      ),
    );
  }
  if (project === 'service-replay') {
    const parallelWorker =
      ownerBindings[getOwnerReleaseBindingName(replayParallelRelease.release)];
    if (parallelWorker === undefined) {
      throw new Error('Missing parallel Service replay Worker.');
    }
    Object.assign(options.serviceBindings, {
      REPLAY_PARALLEL_RELEASE: parallelWorker,
    });
  }
  if (project === 'service-time') {
    const replayWorker =
      ownerBindings[
        getOwnerReleaseBindingName(publicationReleases[1]!.release)
      ];
    if (replayWorker === undefined) {
      throw new Error('Missing timed Service replay Worker.');
    }
    Object.assign(
      options.durableObjects,
      bindNamespaces(
        {
          TIMED_REPLAY_REPO: workerOptions.durableObjects.SERVICE_VERSION_REPO,
          TIMED_REPLAY_HISTORY:
            workerOptions.durableObjects.SERVICE_VERSION_CHAIN,
        },
        replayWorker,
      ),
    );
  }
  if (project === 'service-actor-connections') {
    const historicalWorker =
      ownerBindings[
        getOwnerReleaseBindingName(publicationReleases[1]!.release)
      ];
    if (historicalWorker === undefined) {
      throw new Error('Missing historical Actor Worker.');
    }
    Object.assign(options.durableObjects, {
      ACTOR_CONNECTION_TEST_SYSTEM_REPO: {
        ...workerOptions.durableObjects.SYSTEM_REPO,
        scriptName: systemName,
      },
      HISTORICAL_ACTOR_CONNECTION_CHAIN: {
        ...workerOptions.durableObjects.SERVICE_ACTOR_VERSION_CHAIN,
        className: 'HistoricalActorConnectionTestChain',
        scriptName: historicalWorker,
      },
    });
  }
  if (project === 'aggregate-adapter-game-replay') {
    const writer = ownerBindings[getOwnerReleaseBindingName(gameV3.release)];
    if (writer === undefined) throw new Error('Missing Game replay writer.');
    Object.assign(options.durableObjects, {
      GAME_REPLAY_WRITER: {
        ...workerOptions.durableObjects.AGGREGATE_VERSION_REPO,
        className: 'GameReplayWriter',
        scriptName: writer,
      },
    });
  }
  const family = 'aggregateName' in owner.release ? 'Aggregate' : 'Service';
  const releaseClasses = getOwnerReleaseDurableObjectClassNames(owner.release);
  return {
    setup: [
      "import 'config';",
      "import { env as ownerEnvironment } from 'cloudflare:workers';",
      `import { ${owner.exportName} as fixtureRelease } from ${JSON.stringify(owner.sourcePath)};`,
      `const { ${family}ReleaseWorker: FixtureReleaseWorker } = make${family}ReleaseWorker(fixtureRelease, { ...${JSON.stringify(owner.host)}, systemSpecHash: ownerEnvironment.ZEROSPIN_SYSTEM_SPEC_HASH });`,
      ...(project === 'service-replay'
        ? [
            `export default class extends FixtureReleaseWorker {
              async fetch(request) {
                if (new URL(request.url).pathname === ${JSON.stringify(RUN_OWNER_OPERATION_PATH + '/request')}) {
                  return new Response(null, { status: 503 });
                }
                return super.fetch(request);
              }
            }`,
          ]
        : ['export default FixtureReleaseWorker;']),
      `export { ${releaseClasses.join(', ')} };`,
    ].join('\n'),
    miniflare: { ...options, workers },
  };
}

function agentFixtureCatalog(
  ownerReleases: readonly IOwnerReleaseIdentity[],
  observeServiceAgentRegistration: boolean,
) {
  return `
    import { env as fixtureEnv, withEnv } from 'cloudflare:workers';
    import { SystemRepo as Catalog } from ${JSON.stringify(resolve(systemWorker))};
    const fixtureOwnerReleases = ${JSON.stringify(ownerReleases)};
    export class SystemRepo extends Catalog {
      async acceptFixtureSystemSpec(spec) {
        const accepted = await super.registerSystemSpec({ spec });
        if (accepted.result._tag === 'Success') {
          const bindings = { ...fixtureEnv, ZEROSPIN_SYSTEM_SPEC_HASH: spec.hash };
          withEnv(bindings, () => {
            configureFixtureSnapshot(JSON.stringify({ spec, ownerReleases: fixtureOwnerReleases }));
          });
        }
        return accepted;
      }

      ${
        observeServiceAgentRegistration
          ? `
        async registerRepo(props) {
          if (props.registration.repoType === 'ServiceAgentNodeRepo') {
            const key = 'service-agent-test/registration/' + crypto.randomUUID();
            await fixtureEnv.BUCKET.put(key, JSON.stringify(props));
          }
          return super.registerRepo(props);
        }
      `
          : ''
      }
    }
  `;
}

function serviceAgentRootFaults() {
  return `
    import { env } from 'cloudflare:workers';
    import { ServiceChain as OwnerChain } from ${JSON.stringify(resolve(systemWorker))};
    export class ServiceChain extends OwnerChain {
      async admitFromServiceAgentNode(input) {
        const key = 'service-agent-test/admission/' + crypto.randomUUID();
        await env.BUCKET.put(key, JSON.stringify(input));
        const fault = await env.BUCKET.get('service-agent-test/admission-fault');
        const mode = await fault?.text();
        if (mode === 'before') throw new Error('admission unavailable');
        const result = await super.admitFromServiceAgentNode(input);
        if (mode === 'after' && result.result._tag === 'Success') {
          throw new Error('admission acknowledgement interrupted');
        }
        return result;
      }
    }
  `;
}

function aggregateTimeRootFixture() {
  return `
    import { env } from 'cloudflare:workers';
    import * as Effect from 'effect/Effect';
    import SystemWorker, { AggregateChain as OwnerChain } from ${JSON.stringify(resolve(systemWorker))};
    import { appendAggregateCommand } from '@zerospin/system-worker/AggregateChain/admitAggregateCommands/appendAggregateCommand';
    import { listPinnedOwnerReleases, runWorkerPromise } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
    export default class extends SystemWorker {
      selectAggregateTimeSpec(spec) {
        env.ZEROSPIN_SYSTEM_SPEC_HASH = spec.hash;
        configureFixtureSnapshot(JSON.stringify({ spec, ownerReleases: listPinnedOwnerReleases() }));
      }
    }
    export class AggregateChain extends OwnerChain {
      async stageAggregateTimePrefix(command) {
        this.db.transaction(tx => Effect.runSync(appendAggregateCommand(tx, command)));
        await this.ctx.storage.deleteAlarm();
      }

      async enrollAggregateTimeReleases() {
        await runWorkerPromise(this.onDOActivation());
      }
    }
  `;
}

function aggregateAgentRootFaults() {
  return `
    import { env } from 'cloudflare:workers';
    import { AggregateChain as OwnerChain } from ${JSON.stringify(resolve(systemWorker))};
    export class AggregateChain extends OwnerChain {
      async admitFromAggregateAgentNode(input) {
        const result = await super.admitFromAggregateAgentNode(input);
        await env.BUCKET.put('aggregate-agent-test/admission/' + crypto.randomUUID(), JSON.stringify(input));
        if (result.result._tag === 'Success' &&
            await env.BUCKET.head('aggregate-agent-test/lose-admission-reply')) {
          throw new Error('lost admission reply');
        }
        return result;
      }

      async transitionAgentNodeProducer(input) {
        const result = await super.transitionAgentNodeProducer(input);
        await env.BUCKET.put('aggregate-agent-test/transition/' + crypto.randomUUID(), JSON.stringify(input));
        const fault = 'aggregate-agent-test/lose-transition-reply';
        if (result.result._tag === 'Success' && await env.BUCKET.head(fault)) {
          await env.BUCKET.delete(fault);
          throw new Error('lost transition acknowledgement');
        }
        return result;
      }
    }
  `;
}

async function pinnedAggregateWorkers(configPath: string, project: string) {
  const stable = runnerName(project);
  const older = 'pinned-replay-older';
  const newer = 'pinned-replay-newer';
  const agent = 'pinned-replay-agent';
  const reservations = 'pinned-replay-reservations';
  const bucket = 'pinned-replay-provider';
  const olderRelease = { aggregateName: 'checkout', aggregateVersion: 1 };
  const newerRelease = { aggregateName: 'checkout', aggregateVersion: 2 };
  const service = { serviceName: 'reservations', serviceVersion: 2 };
  const [
    { host: olderHost, systemSpec: olderSpec },
    { host: newerHost, systemSpec },
  ] = await Promise.all([
    compileFixtureSystem(configPath, 'pinnedOlderConfig'),
    compileFixtureSystem(configPath, 'pinnedStableConfig'),
  ]);
  const { compatibilityDate, compatibilityFlags, bindings, durableObjects } =
    workerOptions;
  const common = { compatibilityDate, compatibilityFlags, modules: true };
  const rootNamespaces = selectNamespaces(name => rootRepos.has(name));
  const agentNamespaces = selectNamespaces(name => name.includes('Agent'));
  const ownerBindings = {
    [getOwnerReleaseBindingName(olderRelease)]: older,
    [getOwnerReleaseBindingName(newerRelease)]: newer,
    [getOwnerReleaseBindingName(service)]: reservations,
  };
  const [olderScript, newerScript, serviceScript, agentScript] =
    await Promise.all([
      bundlePinnedOwner({
        configPath,
        sourcePath: configPath,
        exportName: 'pinnedOlderRelease',
        release: olderRelease,
        host: olderHost,
      }),
      bundlePinnedOwner({
        configPath,
        sourcePath: configPath,
        exportName: 'pinnedNewerRelease',
        release: newerRelease,
        host: newerHost,
        withOwnerFaults: true,
      }),
      bundlePinnedOwner({
        configPath,
        sourcePath: join(
          dirname(configPath),
          '../chain-command-delivery/reservationsV2.ts',
        ),
        exportName: 'reservationsV2',
        release: service,
        host: newerHost,
      }),
      bundleTestWorker(agentMain, configPath),
    ]);
  const pinnedOwner = (
    name: string,
    release: IOwnerRelease,
    script: string,
    specHash: string,
  ) => {
    const classes = new Set(getOwnerReleaseDurableObjectClassNames(release));
    return {
      ...common,
      name,
      script,
      bindings: {
        ...bindings,
        ZEROSPIN_VERSION_METADATA: { id: name },
        ZEROSPIN_OWNER_RELEASE: release,
        ZEROSPIN_SYSTEM_ID: newerHost.systemId,
        ZEROSPIN_SYSTEM_SPEC_HASH: specHash,
      },
      durableObjects: {
        ...bindNamespaces(rootNamespaces, stable),
        ...bindNamespaces(agentNamespaces, agent),
        ...selectNamespaces(className => classes.has(className)),
      },
      serviceBindings:
        name === newer
          ? { [getOwnerReleaseBindingName(olderRelease)]: older }
          : {},
      r2Buckets: { PINNED_PROVIDER: bucket },
    };
  };
  const snapshot = JSON.stringify({
    spec: systemSpec,
    ownerReleases: [
      { specHash: olderSpec.hash, release: olderRelease, versionId: older },
      { specHash: systemSpec.hash, release: newerRelease, versionId: newer },
      { specHash: systemSpec.hash, release: service, versionId: reservations },
    ].map(pin => ({
      ...pin,
      systemId: newerHost.systemId,
    })),
  });
  return {
    setup: [
      "import { configureServingSystemSpec as configureFixtureSnapshot } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';",
      `configureFixtureSnapshot(${JSON.stringify(snapshot)});`,
    ].join('\n'),
    miniflare: {
      ...common,
      bindings: {
        ...bindings,
        ZEROSPIN_SYSTEM_ID: newerHost.systemId,
        ZEROSPIN_SYSTEM_NAME: newerHost.systemName,
        ZEROSPIN_SYSTEM_SPEC_HASH: systemSpec.hash,
        ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1',
        ZEROSPIN_VERSION_METADATA: { id: stable },
      },
      durableObjects: {
        ...rootNamespaces,
        ...bindNamespaces(agentNamespaces, agent),
        PINNED_SYSTEM_REPO: durableObjects.SYSTEM_REPO,
        PINNED_AGGREGATE_CHAIN: durableObjects.AGGREGATE_CHAIN,
        PINNED_SERVICE_CHAIN: durableObjects.SERVICE_CHAIN,
        ...bindNamespaces(
          {
            PINNED_OLDER_AGGREGATE_VERSION_CHAIN:
              durableObjects.AGGREGATE_VERSION_CHAIN,
            PINNED_OLDER_REPO: durableObjects.AGGREGATE_VERSION_REPO,
          },
          older,
        ),
        ...bindNamespaces(
          {
            PINNED_NEWER_AGGREGATE_VERSION_CHAIN:
              durableObjects.AGGREGATE_VERSION_CHAIN,
            PINNED_NEWER_REPO: durableObjects.AGGREGATE_VERSION_REPO,
          },
          newer,
        ),
      },
      r2Buckets: { BUCKET: bucket, PINNED_PROVIDER: bucket },
      serviceBindings: {
        ...ownerBindings,
        PINNED_OLDER_OWNER: older,
        PINNED_NEWER_OWNER: newer,
        ZEROSPIN_AGENT_WORKER: agent,
      },
      workers: [
        {
          ...common,
          name: agent,
          script: agentScript,
          bindings,
          durableObjects: {
            ...agentNamespaces,
            ...bindNamespaces(rootNamespaces, stable),
          },
          serviceBindings: ownerBindings,
          r2Buckets: { BUCKET: bucket },
        },
        pinnedOwner(older, olderRelease, olderScript, olderSpec.hash),
        pinnedOwner(newer, newerRelease, newerScript, systemSpec.hash),
        pinnedOwner(reservations, service, serviceScript, systemSpec.hash),
      ],
    },
  };
}

async function pinnedServiceWorkers(configPath: string, project: string) {
  const stable = runnerName(project);
  const older = 'pinned-service-older';
  const newer = 'pinned-service-newer';
  const bucket = 'pinned-service-provider';
  const olderRelease = { serviceName: 'reservations', serviceVersion: 1 };
  const newerRelease = { serviceName: 'reservations', serviceVersion: 2 };
  const rootNamespaces = selectNamespaces(className =>
    rootRepos.has(className),
  );
  const releaseClasses = new Set(
    getOwnerReleaseDurableObjectClassNames(olderRelease),
  );
  const ownedNamespaces = selectNamespaces(className =>
    releaseClasses.has(className),
  );
  const { compatibilityDate, compatibilityFlags, bindings, durableObjects } =
    workerOptions;
  const [
    { host: olderHost, systemSpec: olderSpec },
    { host: newerHost, systemSpec },
  ] = await Promise.all([
    compileFixtureSystem(configPath, 'pinnedOlderConfig'),
    compileFixtureSystem(configPath),
  ]);
  const [olderScript, newerScript] = await Promise.all([
    bundlePinnedOwner({
      configPath,
      sourcePath: join(dirname(configPath), 'reservationsV1.ts'),
      exportName: 'reservationsV1',
      release: olderRelease,
      host: olderHost,
    }),
    bundlePinnedOwner({
      configPath,
      sourcePath: join(dirname(configPath), 'reservationsV2.ts'),
      exportName: 'reservationsV2',
      release: newerRelease,
      host: newerHost,
      withOwnerFaults: true,
    }),
  ]);
  const pinnedOwner = (
    name: string,
    release: IOwnerRelease,
    script: string,
    specHash: string,
  ) => ({
    name,
    modules: true,
    script,
    compatibilityDate,
    compatibilityFlags,
    bindings: {
      ...bindings,
      ZEROSPIN_VERSION_METADATA: { id: name },
      ZEROSPIN_OWNER_RELEASE: release,
      ZEROSPIN_SYSTEM_ID: newerHost.systemId,
      ZEROSPIN_SYSTEM_SPEC_HASH: specHash,
    },
    durableObjects: {
      ...bindNamespaces(rootNamespaces, stable),
      ...ownedNamespaces,
    },
    r2Buckets: { PINNED_PROVIDER: bucket },
  });
  const snapshot = JSON.stringify({
    spec: systemSpec,
    ownerReleases: [
      {
        systemId: olderHost.systemId,
        release: olderRelease,
        versionId: older,
        specHash: olderSpec.hash,
      },
      {
        systemId: newerHost.systemId,
        release: newerRelease,
        versionId: newer,
        specHash: systemSpec.hash,
      },
    ],
  });
  return {
    setup: [
      "import { configureServingSystemSpec as configureFixtureSnapshot } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';",
      `configureFixtureSnapshot(${JSON.stringify(snapshot)});`,
    ].join('\n'),
    miniflare: {
      compatibilityDate,
      compatibilityFlags: [...compatibilityFlags],
      bindings: {
        ...bindings,
        ZEROSPIN_SYSTEM_ID: newerHost.systemId,
        ZEROSPIN_SYSTEM_NAME: newerHost.systemName,
        ZEROSPIN_SYSTEM_SPEC_HASH: systemSpec.hash,
        ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1',
        ZEROSPIN_VERSION_METADATA: { id: stable },
      },
      durableObjects: {
        ...rootNamespaces,
        PINNED_OLDER_SERVICE_VERSION_CHAIN: {
          ...durableObjects.SERVICE_VERSION_CHAIN,
          scriptName: older,
        },
        PINNED_NEWER_SERVICE_VERSION_CHAIN: {
          ...durableObjects.SERVICE_VERSION_CHAIN,
          scriptName: newer,
        },
        PINNED_OLDER_SERVICE_REPO: {
          ...durableObjects.SERVICE_VERSION_REPO,
          scriptName: older,
        },
        PINNED_NEWER_SERVICE_REPO: {
          ...durableObjects.SERVICE_VERSION_REPO,
          scriptName: newer,
        },
      },
      r2Buckets: { BUCKET: 'BUCKET', PINNED_PROVIDER: bucket },
      serviceBindings: {
        PINNED_OLDER_OWNER: older,
        PINNED_NEWER_OWNER: newer,
        [getOwnerReleaseBindingName(olderRelease)]: older,
        [getOwnerReleaseBindingName(newerRelease)]: newer,
      },
      workers: [
        pinnedOwner(older, olderRelease, olderScript, olderSpec.hash),
        pinnedOwner(newer, newerRelease, newerScript, systemSpec.hash),
      ],
    },
  };
}

async function bundlePinnedOwner({
  configPath,
  configFactory,
  sourcePath,
  exportName,
  release,
  host,
  withOwnerFaults = false,
}: {
  configPath: string;
  configFactory?: string;
  sourcePath: string;
  exportName: string;
  release: IOwnerRelease;
  host: Parameters<typeof makeOwnerReleaseEntrypoint>[0]['host'];
  withOwnerFaults?: boolean;
}) {
  const contents = makeOwnerReleaseEntrypoint({
    frameworkMain: resolve(
      'aggregateName' in release ? aggregateOwnerMain : serviceOwnerMain,
    ),
    source: { modulePath: resolve(sourcePath), exportName },
    release,
    host,
  });
  return bundleTestWorker({ contents }, configPath, undefined, {
    withOwnerFaults,
    pauseServicePublication: 'serviceName' in release,
  });
}

async function compileFixtureSystem(
  configPath: string,
  configFactory?: string,
) {
  const configModule = await bundleTestWorker(
    {
      contents: `
    import config from 'config';
    import { makeSystemSpec } from '@zerospin/core/system/make/makeSystemSpec';
    const systemSpec = makeSystemSpec({ system: config.system });
    export default {
      systemSpec,
      host: { systemId: config.systemId, systemName: systemSpec.systemName },
    };
  `,
    },
    configPath,
    configFactory,
    { evaluateConfig: true },
  );
  const configUrl =
    'data:text/javascript;base64,' +
    Buffer.from(configModule).toString('base64');
  const {
    default: system,
  }: {
    default: {
      systemSpec: ISystemSpec;
      host: Parameters<typeof makeOwnerReleaseEntrypoint>[0]['host'];
    };
  } = await import(/* @vite-ignore */ configUrl);
  return system;
}

async function bundleTestWorker(
  main: string | { contents: string },
  configPath: string,
  configFactory?: string,
  options?: {
    withOwnerFaults?: boolean;
    evaluateConfig?: boolean;
    pauseServicePublication?: boolean;
    pauseServiceOriginals?: boolean;
    manualServiceProjection?: boolean;
    observeServiceReplayFrom?: string;
    pauseAggregateTimePredecessor?: boolean;
    gateDestinationOutcome?: boolean;
  },
): Promise<string> {
  const wrapOwner =
    options?.withOwnerFaults ||
    options?.manualServiceProjection ||
    options?.gateDestinationOutcome ||
    options?.observeServiceReplayFrom !== undefined ||
    options?.pauseAggregateTimePredecessor;
  const { outputFiles } = await build({
    ...(wrapOwner
      ? {
          stdin: {
            contents: `
              import { env, RpcTarget } from 'cloudflare:workers';
              import OwnerReleaseWorker from 'pinned-owner';
              export * from 'pinned-owner';
              ${
                options?.pauseAggregateTimePredecessor
                  ? `
                    import * as Effect from 'effect/Effect';
                    import { AggregateVersionRepo as ReleaseRepo } from 'pinned-owner';
                    export class AggregateVersionRepo extends ReleaseRepo {
                      onDOActivation() {
                        const activation = super.onDOActivation();
                        if (this.key.aggregateId !== 'acc_drain') return activation;
                        return Effect.promise(async () => {
                          const gate = 'aggregate-time/pause-predecessor';
                          if (!(await env.BUCKET.head(gate))) return;
                          await env.BUCKET.put('aggregate-time/predecessor-entered', '');
                          const deadline = Date.now() + 15_000;
                          while (await env.BUCKET.head(gate)) {
                            if (Date.now() >= deadline) throw new Error('Predecessor activation gate timed out');
                            await new Promise(resolve => setTimeout(resolve, 10));
                          }
                        }).pipe(Effect.andThen(activation));
                      }
                    }
                  `
                  : ''
              }
              ${
                options?.pauseServicePublication
                  ? `
                import { ServiceVersionChain as ReleaseHistory } from 'pinned-owner';
                export class ServiceVersionChain extends ReleaseHistory {
                  async appendEvaluatedCommands(input) {
                    if (await env.PINNED_PROVIDER.head('pause-service-publication')) {
                      throw new Error('Pause ServiceVersionChain publication');
                    }
                    return super.appendEvaluatedCommands(input);
                  }
                }
              `
                  : ''
              }
              ${
                options?.manualServiceProjection
                  ? `
                import * as Effect from 'effect/Effect';
                import { ServiceVersionChain as ReleaseHistory } from 'pinned-owner';
                export class ServiceVersionChain extends ReleaseHistory {
                  constructor(state, env) {
                    super(state, env);
                    this.actorVersionRepoFanout.wake = () => Effect.void;
                    this.agentVersionRepoFanout.wake = () => Effect.void;
                  }
                  async onAlarm() {}
                }
              `
                  : ''
              }
              ${
                options?.gateDestinationOutcome
                  ? `
                import { ServiceVersionRepo as ReleaseRepo } from 'pinned-owner';
                export class ServiceVersionRepo extends ReleaseRepo {
                  async awaitCommandResult(input) {
                    const marker = await env.BUCKET.get('chain-delivery/destination-outcome');
                    const mode = await marker?.text();
                    if (mode === 'blocked') {
                      throw new Error('Await destination execution after the parent leaves the source Chain');
                    }
                    if (mode === 'observe') {
                      await env.BUCKET.put('chain-delivery/destination-observation/' + crypto.randomUUID(), '');
                    }
                    return super.awaitCommandResult(input);
                  }
                }
              `
                  : ''
              }
              ${
                options?.pauseServiceOriginals
                  ? `
                import { ServiceVersionRepo as ReleaseRepo } from 'pinned-owner';
                export class ServiceVersionRepo extends ReleaseRepo {
                  get executeCommandSubscriber() {
                    const subscriber = super.executeCommandSubscriber;
                    return new class extends RpcTarget {
                      async receive(input) {
                        if (await env.PINNED_PROVIDER.head('pause-service-originals')) {
                          throw new Error('Pause ServiceVersionRepo original execution');
                        }
                        return subscriber.receive(input);
                      }
                    }();
                  }
                }
              `
                  : ''
              }
              ${
                options?.withOwnerFaults
                  ? `
              export default class extends OwnerReleaseWorker {
                async fetch(request) {
                  const path = new URL(request.url).pathname;
                  const bucket = env.PINNED_PROVIDER;
                  if (${JSON.stringify([PREPARE_AGGREGATE_REPLAY_PATH, PREPARE_SERVICE_REPLAY_PATH])}.includes(path)
                    && await bucket.head('replay-source-unavailable')) {
                    return new Response(null, { status: 503 });
                  }
                  if (path !== ${JSON.stringify(RUN_OWNER_OPERATION_PATH)}) {
                    return super.fetch(request);
                  }
                  const attempt = crypto.randomUUID();
                  await bucket.put('owner-attempt/' + attempt, '');
                  const fault = await bucket.get('owner-fault');
                  const mode = await fault?.text();
                  if (mode === 'unavailable') {
                    return new Response(null, { status: 503 });
                  }
                  const response = await super.fetch(request);
                  await bucket.put('owner-reply/' + attempt, String(response.status));
                  if (mode === 'lost-reply') throw new Error('Lost owner operation reply');
                  return response;
                }
              }
              `
                  : options?.observeServiceReplayFrom !== undefined
                    ? `
                        import { observeReplayFixture } from ${JSON.stringify(options.observeServiceReplayFrom)};
                        export default class extends OwnerReleaseWorker {
                          async fetch(request) {
                            return observeReplayFixture(request) ?? super.fetch(request);
                          }
                        }
                      `
                    : 'export default OwnerReleaseWorker;'
              }
            `,
            resolveDir: process.cwd(),
          },
        }
      : typeof main === 'string'
        ? { entryPoints: [main] }
        : { stdin: { ...main, resolveDir: process.cwd() } }),
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:*', 'node:*'],
    tsconfigRaw: {
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@zerospin/core/*': ['./packages/core/src/*'],
          '@zerospin/error': ['./packages/error/src/index.ts'],
          '@zerospin/logger': ['./packages/logger/src/index.ts'],
          '@zerospin/shapes': ['./packages/shapes/src/index.ts'],
          '@zerospin/agent-worker/*': ['./packages/agent-worker/src/*'],
          '@zerospin/owner-release-worker/*': [
            './packages/owner-release-worker/src/*',
          ],
          '@zerospin/system-worker': ['./packages/system-worker/src/index.ts'],
          '@zerospin/system-worker/*': ['./packages/system-worker/src/*'],
        },
      },
    },
    plugins: [
      {
        name: 'workerd-fixture-modules',
        setup(builder) {
          if (options?.evaluateConfig) {
            builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
              path: 'cloudflare:workers',
              namespace: 'fixture-env',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture-env' }, () => ({
              contents: 'export const env = {};',
            }));
          }
          if (typeof main !== 'string' && wrapOwner) {
            builder.onResolve({ filter: /^pinned-owner$/ }, () => ({
              path: 'pinned-owner',
              namespace: 'pinned-owner',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'pinned-owner' }, () => ({
              ...main,
              resolveDir: process.cwd(),
            }));
          }
          builder.onResolve({ filter: /^config$/ }, args => ({
            path: args.path,
            namespace: 'pinned-release-config',
          }));
          builder.onLoad(
            { filter: /.*/, namespace: 'pinned-release-config' },
            () => ({
              contents:
                configFactory === undefined
                  ? `export { default } from ${JSON.stringify(resolve(configPath))};`
                  : `import { ${configFactory} } from ${JSON.stringify(resolve(configPath))}; export default ${configFactory}();`,
              resolveDir: process.cwd(),
            }),
          );
        },
      },
    ],
  });
  const script = outputFiles[0];
  if (script === undefined) throw new Error(`Missing ${configFactory} bundle`);
  return script.text;
}
