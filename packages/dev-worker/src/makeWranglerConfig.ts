import path from 'node:path';

import {
  getOwnerReleaseWorkerName,
  OWNER_RELEASE_BINDING_PREFIX,
  type IOwnerRelease,
} from '@zerospin/core/system/ownerReleaseDeployment';
import type {
  ISystemConfig,
  ISystemEnvironmentId,
} from '@zerospin/core/system/types';
import { sha256 } from '@zerospin/core/utils/sha256';
import { makeZerospinError } from '@zerospin/error';

const applicationBindingFields = {
  d1_databases: 'binding',
  kv_namespaces: 'binding',
  r2_buckets: 'binding',
  send_email: 'name',
  services: 'binding',
} as const;

const applicationFields = new Set([
  ...Object.keys(applicationBindingFields),
  'vars',
]);

export function getApplicationResourceBindingNames(
  wrangler: NonNullable<ISystemConfig['wrangler']>,
): string[] {
  return Object.entries(applicationBindingFields).flatMap(([field, key]) => {
    const entries = wrangler[field];
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const name: unknown = Reflect.get(entry, key);
      return typeof name === 'string' ? [name] : [];
    });
  });
}

function validateApplicationWranglerConfig(
  wrangler: NonNullable<ISystemConfig['wrangler']>,
  reservedBindings: ReadonlySet<string>,
) {
  for (const field of Object.keys(wrangler)) {
    if (!applicationFields.has(field)) {
      throw makeZerospinError({
        code: 'zerospin-wrangler-field-unsupported',
        message: `System Wrangler configuration cannot set "${field}".`,
      });
    }
  }
  const vars = wrangler.vars;
  if (
    vars !== undefined &&
    (vars === null || typeof vars !== 'object' || Array.isArray(vars))
  ) {
    throw makeZerospinError({
      code: 'zerospin-wrangler-vars-invalid',
      message: 'System Wrangler vars must be a JSON object.',
    });
  }
  const names = new Set(reservedBindings);
  for (const name of [
    ...Object.keys(vars ?? {}),
    ...getApplicationResourceBindingNames(wrangler),
  ]) {
    if (names.has(name) || name.startsWith(OWNER_RELEASE_BINDING_PREFIX)) {
      throw makeZerospinError({
        code: 'zerospin-wrangler-binding-conflict',
        message: `System Wrangler binding "${name}" is already in use or reserved.`,
      });
    }
    names.add(name);
  }
}

const agentBindings = [
  { name: 'AGGREGATE_AGENT_NODE_REPO', class_name: 'AggregateAgentNodeRepo' },
  { name: 'SERVICE_AGENT_NODE_REPO', class_name: 'ServiceAgentNodeRepo' },
  {
    name: 'AGGREGATE_AGENT_VERSION_REPO',
    class_name: 'AggregateAgentVersionRepo',
  },
  {
    name: 'AGGREGATE_AGENT_VERSION_CHAIN',
    class_name: 'AggregateAgentVersionChain',
  },
  { name: 'SERVICE_AGENT_VERSION_REPO', class_name: 'ServiceAgentVersionRepo' },
  {
    name: 'SERVICE_AGENT_VERSION_CHAIN',
    class_name: 'ServiceAgentVersionChain',
  },
];

export function getAgentWorkerName(systemWorkerName: string) {
  const suffix = '-agents';
  if (systemWorkerName.length + suffix.length <= 63) {
    return systemWorkerName + suffix;
  }
  const hashedSuffix = suffix + '-' + sha256(systemWorkerName).slice(0, 24);
  return systemWorkerName.slice(0, 63 - hashedSuffix.length) + hashedSuffix;
}

/** Framework-owned backend configuration used by the CLI. */
export function makeWranglerConfig(props: {
  config: ISystemConfig;
  main: string;
  configModulePath: string;
  environment: ISystemEnvironmentId;
}) {
  const { config, main, configModulePath, environment } = props;
  const name = `${config.system.name}-zerospin`;
  if (!/^[a-z][a-z0-9_-]*$/.test(name) || name.length > 63) {
    throw makeZerospinError({
      code: 'zerospin-worker-name-invalid',
      message: `System name ${JSON.stringify(config.system.name)} produces an invalid Worker name: ${name}.`,
    });
  }
  const frameworkBindings = [
    { name: 'SYSTEM_REPO', class_name: 'SystemRepo' },
    ...agentBindings,
    { name: 'AGGREGATE_VERSION_REPO', class_name: 'AggregateVersionRepo' },
    { name: 'AGGREGATE_VERSION_CHAIN', class_name: 'AggregateVersionChain' },
    {
      name: 'AGGREGATE_ACTOR_VERSION_ARCHIVE',
      class_name: 'AggregateActorVersionArchive',
    },
    {
      name: 'AGGREGATE_VERSION_ARCHIVE',
      class_name: 'AggregateVersionArchive',
    },
    {
      name: 'AGGREGATE_ACTOR_VERSION_REPO',
      class_name: 'AggregateActorVersionRepo',
    },
    { name: 'SERVICE_VERSION_REPO', class_name: 'ServiceVersionRepo' },
    { name: 'SERVICE_VERSION_CHAIN', class_name: 'ServiceVersionChain' },
    {
      name: 'SERVICE_ACTOR_VERSION_ARCHIVE',
      class_name: 'ServiceActorVersionArchive',
    },
    { name: 'SERVICE_VERSION_ARCHIVE', class_name: 'ServiceVersionArchive' },
    {
      name: 'SERVICE_ACTOR_VERSION_REPO',
      class_name: 'ServiceActorVersionRepo',
    },
    { name: 'AGGREGATE_CHAIN', class_name: 'AggregateChain' },
    {
      name: 'AGGREGATE_ACTOR_VERSION_CHAIN',
      class_name: 'AggregateActorVersionChain',
    },
    { name: 'SERVICE_CHAIN', class_name: 'ServiceChain' },
    {
      name: 'SERVICE_ACTOR_VERSION_CHAIN',
      class_name: 'ServiceActorVersionChain',
    },
  ];
  const portable = environment === 'production';
  const stableBindings = new Set([
    'SYSTEM_REPO',
    'AGGREGATE_CHAIN',
    'SERVICE_CHAIN',
  ]);
  const bindings = portable
    ? frameworkBindings.filter(binding => stableBindings.has(binding.name))
    : frameworkBindings;
  const reservedBindings = new Set([
    ...frameworkBindings.map(binding => binding.name),
    'ZEROSPIN_ENVIRONMENT',
    'ZEROSPIN_LOCAL_DEVELOPMENT',
    'ZEROSPIN_DEV_HISTORY',
    'ZEROSPIN_SYSTEM_ID',
    'ZEROSPIN_SYSTEM_NAME',
    'ZEROSPIN_SYSTEM_SPEC_HASH',
    'ZEROSPIN_STORAGE_LAYOUT',
    'ZEROSPIN_TELEMETRY',
    'ZEROSPIN_AGENT_WORKER',
    'ZEROSPIN_VERSION_METADATA',
    'ZEROSPIN_DEPLOYMENT_BOOTSTRAP',
    'ZEROSPIN_OWNER_RELEASE',
    'ZEROSPIN_PUBLISHABLE_KEY',
    'ZEROSPIN_SECRET_KEY',
    'ZEROSPIN_DEV_STARTUP_SPEC_HASH',
  ]);
  if (
    Object.values(config.telemetry?.otlp?.secretHeaders ?? {}).some(
      bindingName =>
        reservedBindings.has(bindingName) ||
        bindingName.startsWith(OWNER_RELEASE_BINDING_PREFIX),
    )
  ) {
    throw makeZerospinError({
      code: 'zerospin-telemetry-secret-binding-conflict',
      message: 'Telemetry secret bindings cannot replace framework bindings.',
    });
  }
  const wrangler = config.wrangler ?? {};
  validateApplicationWranglerConfig(
    wrangler,
    new Set([
      ...reservedBindings,
      ...Object.values(config.telemetry?.otlp?.secretHeaders ?? {}),
    ]),
  );
  const { logs, traces } = config.telemetry?.cloudflare ?? {};
  return {
    ...(portable ? {} : wrangler),
    name,
    main: path.resolve(main),
    compatibility_date: '2026-01-20',
    compatibility_flags: ['nodejs_compat'],
    ...(!portable ? { alias: { config: path.resolve(configModulePath) } } : {}),
    durable_objects: { bindings },
    exports: Object.fromEntries(
      bindings.map(binding => [
        binding.class_name,
        { type: 'durable-object', storage: 'sqlite' },
      ]),
    ),
    ...(environment === 'production'
      ? {
          version_metadata: { binding: 'ZEROSPIN_VERSION_METADATA' },
          preserve_file_names: true,
          minify: true,
        }
      : {}),
    observability: {
      enabled: logs !== undefined || traces !== undefined,
      logs:
        logs === undefined
          ? { enabled: false }
          : {
              enabled: true,
              head_sampling_rate: logs.samplingRate,
              invocation_logs: logs.invocationLogs,
              persist: logs.persist,
              ...(logs.destinations === undefined
                ? {}
                : { destinations: [...logs.destinations] }),
            },
      traces:
        traces === undefined
          ? { enabled: false }
          : {
              enabled: true,
              head_sampling_rate: traces.samplingRate,
              persist: traces.persist,
              ...(traces.destinations === undefined
                ? {}
                : { destinations: [...traces.destinations] }),
            },
    },
    vars: {
      ...(!portable &&
      typeof wrangler.vars === 'object' &&
      wrangler.vars !== null
        ? wrangler.vars
        : {}),
      ZEROSPIN_ENVIRONMENT: environment,
      ZEROSPIN_SYSTEM_ID: config.systemId,
      ZEROSPIN_SYSTEM_NAME: config.system.name,
      ...(environment === 'production'
        ? { ZEROSPIN_SYSTEM_SPEC_HASH: '' }
        : {}),
      ...(portable ? { ZEROSPIN_STORAGE_LAYOUT: 'release-owned-v1' } : {}),
      ...(config.telemetry?.otlp === undefined
        ? {}
        : { ZEROSPIN_TELEMETRY: { otlp: config.telemetry.otlp } }),
    },
  };
}

export function getOwnerReleaseDurableObjectClassNames(release: IOwnerRelease) {
  const family = 'aggregateName' in release ? 'Aggregate' : 'Service';
  return [
    'VersionRepo',
    'VersionChain',
    'VersionArchive',
    'ActorVersionRepo',
    'ActorVersionChain',
    'ActorVersionArchive',
  ].map(suffix => family + suffix);
}

function sqliteExports(bindings: readonly { class_name: string }[]) {
  return Object.fromEntries(
    bindings.map(({ class_name }) => [
      class_name,
      { type: 'durable-object', storage: 'sqlite' },
    ]),
  );
}

/** Release and Agent declarations are bundled only into their execution hosts. */
export function makeOwnerReleaseWranglerConfig(props: {
  stable: ReturnType<typeof makeWranglerConfig>;
  release: IOwnerRelease;
  main: string;
  application: ISystemConfig['wrangler'];
}) {
  const { stable, release, main, application } = props;
  const local = getOwnerReleaseDurableObjectClassNames(release).map(
    class_name => ({
      name: class_name.replaceAll(/(?<=[a-z])([A-Z])/g, '_$1').toUpperCase(),
      class_name,
    }),
  );
  const rootBindings = stable.durable_objects.bindings
    .filter(binding =>
      ['SYSTEM_REPO', 'AGGREGATE_CHAIN', 'SERVICE_CHAIN'].includes(
        binding.name,
      ),
    )
    .map(binding => ({ ...binding, script_name: stable.name }));
  return {
    ...stable,
    ...application,
    services: Array.isArray(application?.services) ? application.services : [],
    name: getOwnerReleaseWorkerName(stable.name, release),
    main,
    alias: undefined,
    workers_dev: false,
    preview_urls: false,
    version_metadata: { binding: 'ZEROSPIN_VERSION_METADATA' },
    vars: {
      ...(typeof application?.vars === 'object' && application.vars !== null
        ? application.vars
        : {}),
      ...stable.vars,
      ZEROSPIN_OWNER_RELEASE: release,
    },
    durable_objects: {
      bindings: [
        ...local,
        ...rootBindings,
        ...agentBindings.map(binding => ({
          ...binding,
          script_name: getAgentWorkerName(stable.name),
        })),
      ],
    },
    exports: sqliteExports(local),
  };
}

/** The serving SystemWorker reaches the separate Agent namespaces without owning them. */
export function configureAgentPlacement<
  CONFIG extends ReturnType<typeof makeWranglerConfig>,
>(stable: CONFIG, placement: 'separate' | 'bootstrap') {
  const bindings = stable.durable_objects.bindings;
  return {
    ...stable,
    durable_objects: {
      bindings:
        placement === 'bootstrap'
          ? bindings
          : [
              ...bindings,
              ...agentBindings.map(binding => ({
                ...binding,
                script_name: getAgentWorkerName(stable.name),
              })),
            ],
    },
  };
}

/** AgentWorker owns Node state and the corresponding versioned projections. */
export function makeAgentWranglerConfig(props: {
  stable: ReturnType<typeof makeWranglerConfig>;
  main: string;
  configModulePath: string;
  application: ISystemConfig['wrangler'];
}) {
  const { stable, main, configModulePath, application } = props;
  return {
    ...stable,
    ...application,
    services: Array.isArray(application?.services) ? application.services : [],
    name: getAgentWorkerName(stable.name),
    main,
    alias: { config: path.resolve(configModulePath) },
    workers_dev: false,
    preview_urls: false,
    vars: {
      ...(typeof application?.vars === 'object' && application.vars !== null
        ? application.vars
        : {}),
      ...stable.vars,
    },
    durable_objects: {
      bindings: [
        ...agentBindings,
        ...stable.durable_objects.bindings
          .filter(binding =>
            ['SYSTEM_REPO', 'AGGREGATE_CHAIN', 'SERVICE_CHAIN'].includes(
              binding.name,
            ),
          )
          .map(binding => ({ ...binding, script_name: stable.name })),
      ],
    },
    exports: sqliteExports(agentBindings),
  };
}
