import type { IRepoType, ISystemId } from '@zerospin/core/system/types';
import { makeFn } from '@zerospin/logger';
import * as Effect from 'effect/Effect';

import { aggregateActorVersionArchiveNameUtils } from '../../../AggregateActorVersionArchive/aggregateActorVersionArchiveName.js';
import { aggregateActorVersionChainNameUtils } from '../../../AggregateActorVersionChain/aggregateActorVersionChainName.js';
import { aggregateActorVersionRepoNameUtils } from '../../../AggregateActorVersionRepo/aggregateActorVersionRepoName.js';
import { aggregateAgentNodeRepoMigratableDORepoConfig } from '../../../AggregateAgentNodeRepo/aggregateAgentNodeRepoMigratableDORepoConfig.js';
import { aggregateAgentVersionChainNameUtils } from '../../../AggregateAgentVersionChain/aggregateAgentVersionChainName.js';
import { aggregateAgentVersionRepoNameUtils } from '../../../AggregateAgentVersionRepo/aggregateAgentVersionRepoName.js';
import { aggregateChainNameUtils } from '../../../AggregateChain/aggregateChainName.js';
import { aggregateVersionArchiveNameUtils } from '../../../AggregateVersionArchive/aggregateVersionArchiveName.js';
import { aggregateVersionChainNameUtils } from '../../../AggregateVersionChain/aggregateVersionChainName.js';
import { aggregateVersionRepoNameUtils } from '../../../AggregateVersionRepo/aggregateVersionRepoName.js';
import { AggregateActorVersionArchives } from '../../../repoServices/AggregateActorVersionArchives.js';
import { AggregateActorVersionChains } from '../../../repoServices/AggregateActorVersionChains.js';
import { AggregateActorVersionRepos } from '../../../repoServices/AggregateActorVersionRepos.js';
import { AggregateAgentNodeRepos } from '../../../repoServices/AggregateAgentNodeRepos.js';
import { AggregateAgentVersionChains } from '../../../repoServices/AggregateAgentVersionChains.js';
import { AggregateAgentVersionRepos } from '../../../repoServices/AggregateAgentVersionRepos.js';
import { AggregateChains } from '../../../repoServices/AggregateChains.js';
import { AggregateVersionArchives } from '../../../repoServices/AggregateVersionArchives.js';
import { AggregateVersionChains } from '../../../repoServices/AggregateVersionChains.js';
import { AggregateVersionRepos } from '../../../repoServices/AggregateVersionRepos.js';
import { ServiceActorVersionArchives } from '../../../repoServices/ServiceActorVersionArchives.js';
import { ServiceActorVersionChains } from '../../../repoServices/ServiceActorVersionChains.js';
import { ServiceActorVersionRepos } from '../../../repoServices/ServiceActorVersionRepos.js';
import { ServiceAgentNodeRepos } from '../../../repoServices/ServiceAgentNodeRepos.js';
import { ServiceAgentVersionChains } from '../../../repoServices/ServiceAgentVersionChains.js';
import { ServiceAgentVersionRepos } from '../../../repoServices/ServiceAgentVersionRepos.js';
import { ServiceChains } from '../../../repoServices/ServiceChains.js';
import { ServiceVersionArchives } from '../../../repoServices/ServiceVersionArchives.js';
import { ServiceVersionChains } from '../../../repoServices/ServiceVersionChains.js';
import { ServiceVersionRepos } from '../../../repoServices/ServiceVersionRepos.js';
import { serviceActorVersionArchiveNameUtils } from '../../../ServiceActorVersionArchive/serviceActorVersionArchiveName.js';
import { serviceActorVersionChainNameUtils } from '../../../ServiceActorVersionChain/serviceActorVersionChainName.js';
import { serviceActorVersionRepoNameUtils } from '../../../ServiceActorVersionRepo/serviceActorVersionRepoName.js';
import { serviceAgentNodeRepoMigratableDORepoConfig } from '../../../ServiceAgentNodeRepo/serviceAgentNodeRepoMigratableDORepoConfig.js';
import { serviceAgentVersionChainNameUtils } from '../../../ServiceAgentVersionChain/serviceAgentVersionChainName.js';
import { serviceAgentVersionRepoNameUtils } from '../../../ServiceAgentVersionRepo/serviceAgentVersionRepoName.js';
import { serviceChainNameUtils } from '../../../ServiceChain/serviceChainName.js';
import { serviceVersionArchiveNameUtils } from '../../../ServiceVersionArchive/serviceVersionArchiveName.js';
import { serviceVersionChainNameUtils } from '../../../ServiceVersionChain/serviceVersionChainName.js';
import { serviceVersionRepoNameUtils } from '../../../ServiceVersionRepo/serviceVersionRepoName.js';
import type { SystemRepo } from '../../../SystemRepo/SystemRepo.js';

/** Resolve one already registered Repo using its concrete address codec and capability-owned system ID. */
export const resolveRegisteredRepo = makeFn('SystemApi.resolveRegisteredRepo')(
  function* (props: {
    repoType: IRepoType;
    repoName: string;
    systemId: ISystemId;
    systemRepo: Pick<SystemRepo, 'getRepoTableRows'>;
  }) {
    const { repoType, repoName, systemId, systemRepo } = props;
    switch (repoType) {
      case 'SystemRepo':
        return systemRepo;
      case 'AggregateAgentNodeRepo':
        return yield* (yield* AggregateAgentNodeRepos).getRepo({
          key: {
            ...(yield* aggregateAgentNodeRepoMigratableDORepoConfig.nameUtils.parseName(
              repoName,
            )),
            systemId,
          },
        });
      case 'ServiceAgentNodeRepo':
        return yield* (yield* ServiceAgentNodeRepos).getRepo({
          key: {
            ...(yield* serviceAgentNodeRepoMigratableDORepoConfig.nameUtils.parseName(
              repoName,
            )),
            systemId,
          },
        });
      case 'AggregateChain':
        return yield* (yield* AggregateChains).getRepo({
          key: {
            ...(yield* aggregateChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateVersionRepo':
        return yield* (yield* AggregateVersionRepos).getRepo({
          key: {
            ...(yield* aggregateVersionRepoNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateVersionChain':
        return yield* (yield* AggregateVersionChains).getRepo({
          key: {
            ...(yield* aggregateVersionChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateActorVersionArchive':
        return yield* (yield* AggregateActorVersionArchives).getRepo({
          key: {
            ...(yield* aggregateActorVersionArchiveNameUtils.parseName(
              repoName,
            )),
            systemId,
          },
        });
      case 'AggregateVersionArchive':
        return yield* (yield* AggregateVersionArchives).getRepo({
          key: {
            ...(yield* aggregateVersionArchiveNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateActorVersionRepo':
        return yield* (yield* AggregateActorVersionRepos).getRepo({
          key: {
            ...(yield* aggregateActorVersionRepoNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateAgentVersionRepo':
        return yield* (yield* AggregateAgentVersionRepos).getRepo({
          key: {
            ...(yield* aggregateAgentVersionRepoNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceAgentVersionRepo':
        return yield* (yield* ServiceAgentVersionRepos).getRepo({
          key: {
            ...(yield* serviceAgentVersionRepoNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceAgentVersionChain':
        return yield* (yield* ServiceAgentVersionChains).getRepo({
          key: {
            ...(yield* serviceAgentVersionChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceChain':
        return yield* (yield* ServiceChains).getRepo({
          key: {
            ...(yield* serviceChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceVersionChain':
        return yield* (yield* ServiceVersionChains).getRepo({
          key: {
            ...(yield* serviceVersionChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceActorVersionArchive':
        return yield* (yield* ServiceActorVersionArchives).getRepo({
          key: {
            ...(yield* serviceActorVersionArchiveNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceVersionArchive':
        return yield* (yield* ServiceVersionArchives).getRepo({
          key: {
            ...(yield* serviceVersionArchiveNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceActorVersionRepo':
        return yield* (yield* ServiceActorVersionRepos).getRepo({
          key: {
            ...(yield* serviceActorVersionRepoNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceVersionRepo':
        return yield* (yield* ServiceVersionRepos).getRepo({
          key: {
            ...(yield* serviceVersionRepoNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateActorVersionChain':
        return yield* (yield* AggregateActorVersionChains).getRepo({
          key: {
            ...(yield* aggregateActorVersionChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'AggregateAgentVersionChain':
        return yield* (yield* AggregateAgentVersionChains).getRepo({
          key: {
            ...(yield* aggregateAgentVersionChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      case 'ServiceActorVersionChain':
        return yield* (yield* ServiceActorVersionChains).getRepo({
          key: {
            ...(yield* serviceActorVersionChainNameUtils.parseName(repoName)),
            systemId,
          },
        });
      default:
        return yield* Effect.die(
          new Error(
            `Unexpected registered Repo kind: ${repoType satisfies never}`,
          ),
        );
    }
  },
);
