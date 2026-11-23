import type { IDb } from '@zerospin/core/drizzle/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import { asc, eq, or } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schedule from 'effect/Schedule';

import type { IExpectedAgentInstallation } from '../../agentNodeRepo/agentNodeRuntimeTypes.js';
import { aggregateAgentNodeRepoMigratableDORepoConfig } from '../../AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig.js';
import { getAggregateAgentNodeRepo } from '../../AggregateAgentNodeRepo/getAggregateAgentNodeRepo.js';
import { getSystemSpec } from '../../getSystemSpec/getSystemSpec.js';
import { getServiceAgentNodeRepo } from '../../ServiceAgentNodeRepo/getServiceAgentNodeRepo.js';
import { serviceAgentNodeRepoMigratableDORepoConfig } from '../../ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.js';
import { systemRepoDbConfig } from '../systemRepoDbConfig.js';

type IAggregateNodeKey = Parameters<typeof getAggregateAgentNodeRepo>[0]['key'];
type IServiceNodeKey = Parameters<typeof getServiceAgentNodeRepo>[0]['key'];

/** Resolve a fresh Node stub on retry. Cloudflare can assign the new SystemRepo before the Node. */
const initializeNode = Effect.fn('SystemRepo.initializeNode')(function* <E>(
  getRepo: Effect.Effect<
    Pick<
      Effect.Success<ReturnType<typeof getAggregateAgentNodeRepo>>,
      'initialize'
    >,
    E
  >,
  binding: IExpectedAgentInstallation,
  retryFailed: boolean,
) {
  const attempt = Effect.gen(function* () {
    const node = yield* getRepo;
    return yield* Effect.promise(() =>
      node.initialize(retryFailed, binding),
    ).pipe(
      Effect.catchDefect(error =>
        error instanceof Error &&
        error.message === 'agent-node-deployment-pending'
          ? Effect.fail(makeZerospinError('agent-node-deployment-pending'))
          : Effect.die(error),
      ),
      Effect.flatMap(readRpcEnvelope),
    );
  });
  // Allow the default five-minute assignment window. Retry only this specific
  // mismatch, including its constructor rejection before an RPC can respond.
  return yield* attempt.pipe(
    Effect.retry({
      schedule: Schedule.spaced('1 second'),
      times: 310,
      while: error =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'agent-node-deployment-pending',
    }),
  );
});

/** Initialize every selected Agent and retained Node Repo, stopping installations whose declarations were deleted. */
export const initializeAgentNodes = Effect.fn(
  'SystemRepo.initializeAgentNodes',
)(function* (props: {
  systemId: string;
  db: IDb<typeof systemRepoDbConfig>;
  retryFailed?: boolean;
}) {
  const { db, systemId } = props;
  const system = yield* getSystemSpec();
  const serviceNodes = new Map<string, IServiceNodeKey>();
  const aggregateNodes = new Map<string, IAggregateNodeKey>();
  const aggregates = db
    .select()
    .from(systemRepoDbConfig.schema.aggregates)
    .orderBy(
      asc(systemRepoDbConfig.schema.aggregates.aggregateName),
      asc(systemRepoDbConfig.schema.aggregates.aggregateId),
    )
    .all();

  const serviceKeys = Object.entries(system.serviceAgents).flatMap(
    ([serviceName, agents]) =>
      Object.keys(agents).map(agentName => ({
        systemId,
        serviceName,
        agentName,
      })),
  );
  for (const key of serviceKeys) {
    const name =
      yield* serviceAgentNodeRepoMigratableDORepoConfig.nameUtils.makeName(key);
    serviceNodes.set(name, key);
  }
  for (const aggregate of aggregates) {
    const agents = system.aggregateAgents[aggregate.aggregateName] ?? {};
    for (const agentName of Object.keys(agents)) {
      const key = { systemId, ...aggregate, agentName };
      const name =
        yield* aggregateAgentNodeRepoMigratableDORepoConfig.nameUtils.makeName(
          key,
        );
      aggregateNodes.set(name, key);
    }
  }

  const registeredNodes = db
    .select()
    .from(systemRepoDbConfig.schema.repos)
    .where(
      or(
        eq(systemRepoDbConfig.schema.repos.repoType, 'AggregateAgentNodeRepo'),
        eq(systemRepoDbConfig.schema.repos.repoType, 'ServiceAgentNodeRepo'),
      ),
    )
    .orderBy(asc(systemRepoDbConfig.schema.repos.repoName))
    .all();
  for (const registration of registeredNodes) {
    if (registration.repoType === 'AggregateAgentNodeRepo') {
      const key =
        yield* aggregateAgentNodeRepoMigratableDORepoConfig.nameUtils.parseName(
          registration.repoName,
        );
      if (key.systemId !== systemId) {
        return yield* makeZerospinError('agent-owner-unavailable');
      }
      aggregateNodes.set(registration.repoName, key);
    } else if (registration.repoType === 'ServiceAgentNodeRepo') {
      const key =
        yield* serviceAgentNodeRepoMigratableDORepoConfig.nameUtils.parseName(
          registration.repoName,
        );
      if (key.systemId !== systemId) {
        return yield* makeZerospinError('agent-owner-unavailable');
      }
      serviceNodes.set(registration.repoName, key);
    }
  }

  const failures: string[] = [];
  for (const key of serviceNodes.values()) {
    const error = yield* initializeNode(
      getServiceAgentNodeRepo({ key }),
      system.serviceAgents[key.serviceName]?.[key.agentName] ?? null,
      props.retryFailed ?? false,
    );
    if (error !== null) failures.push(`${key.agentName}: ${error}`);
  }
  for (const key of aggregateNodes.values()) {
    const error = yield* initializeNode(
      getAggregateAgentNodeRepo({ key }),
      system.aggregateAgents[key.aggregateName]?.[key.agentName] ?? null,
      props.retryFailed ?? false,
    );
    if (error !== null) failures.push(`${key.agentName}: ${error}`);
  }
  return failures;
});
