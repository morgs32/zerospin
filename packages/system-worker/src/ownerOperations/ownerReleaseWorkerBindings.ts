import type { IZerospinErrorJson } from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { Effect } from 'effect';

import type { aggregateActorVersionArchiveNameUtils } from '../AggregateActorVersionArchive/aggregateActorVersionArchiveName.js';
import type { aggregateActorVersionChainNameUtils } from '../AggregateActorVersionChain/aggregateActorVersionChainName.js';
import type { aggregateActorVersionRepoNameUtils } from '../AggregateActorVersionRepo/aggregateActorVersionRepoName.js';
import type { authenticateAggregate } from '../AggregateApi/authenticate/authenticateAggregate/authenticateAggregate.js';
import type { aggregateVersionArchiveNameUtils } from '../AggregateVersionArchive/aggregateVersionArchiveName.js';
import type { aggregateVersionChainNameUtils } from '../AggregateVersionChain/aggregateVersionChainName.js';
import type { aggregateVersionRepoNameUtils } from '../AggregateVersionRepo/aggregateVersionRepoName.js';
import type { serviceActorVersionArchiveNameUtils } from '../ServiceActorVersionArchive/serviceActorVersionArchiveName.js';
import type { serviceActorVersionChainNameUtils } from '../ServiceActorVersionChain/serviceActorVersionChainName.js';
import type { serviceActorVersionRepoNameUtils } from '../ServiceActorVersionRepo/serviceActorVersionRepoName.js';
import type { admitService } from '../ServiceApi/admit/admitService/admitService.js';
import type { serviceVersionArchiveNameUtils } from '../ServiceVersionArchive/serviceVersionArchiveName.js';
import type { serviceVersionChainNameUtils } from '../ServiceVersionChain/serviceVersionChainName.js';
import type { serviceVersionRepoNameUtils } from '../ServiceVersionRepo/serviceVersionRepoName.js';

import type {
  IAggregateActorSessionAdmission,
  IServiceActorSessionAdmission,
} from './validateNativeActorSession.js';
import type {
  AggregateAdmissionInputSchema,
  ServiceAdmissionInputSchema,
} from './validateReleaseAdmission.js';

export interface IOwnerReleaseWorkerBinding {
  authenticateAggregateActor(
    systemId: string,
    props: Parameters<typeof authenticateAggregate>[0],
  ): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof authenticateAggregate>>,
      IZerospinErrorJson
    >
  >;
  authenticateServiceActor(
    systemId: string,
    props: Parameters<typeof admitService>[0],
  ): Promise<
    IRpcEnvelope<
      Effect.Success<ReturnType<typeof admitService>>,
      IZerospinErrorJson
    >
  >;
  validateAggregateActorSession(
    systemId: string,
    admission: IAggregateActorSessionAdmission,
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  validateServiceActorSession(
    systemId: string,
    admission: IServiceActorSessionAdmission,
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  validateAggregateAdmission(
    systemId: string,
    command: typeof AggregateAdmissionInputSchema.Type,
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  validateServiceAdmission(
    systemId: string,
    command: typeof ServiceAdmissionInputSchema.Type,
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
  getAggregateVersionRepo(
    key: Parameters<typeof aggregateVersionRepoNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['AGGREGATE_VERSION_REPO']['getByName']
    >
  >;
  getServiceVersionRepo(
    key: Parameters<typeof serviceVersionRepoNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_VERSION_REPO']['getByName']
    >
  >;

  getAggregateVersionChain(
    key: Parameters<typeof aggregateVersionChainNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['AGGREGATE_VERSION_CHAIN']['getByName']
    >
  >;
  getAggregateVersionArchive(
    key: Parameters<typeof aggregateVersionArchiveNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['AGGREGATE_VERSION_ARCHIVE']['getByName']
    >
  >;
  getAggregateActorVersionRepo(
    key: Parameters<typeof aggregateActorVersionRepoNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['AGGREGATE_ACTOR_VERSION_REPO']['getByName']
    >
  >;
  getAggregateActorVersionChain(
    key: Parameters<typeof aggregateActorVersionChainNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['AGGREGATE_ACTOR_VERSION_CHAIN']['getByName']
    >
  >;
  getAggregateActorVersionArchive(
    key: Parameters<typeof aggregateActorVersionArchiveNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['AGGREGATE_ACTOR_VERSION_ARCHIVE']['getByName']
    >
  >;
  getServiceVersionChain(
    key: Parameters<typeof serviceVersionChainNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_VERSION_CHAIN']['getByName']
    >
  >;
  getServiceVersionArchive(
    key: Parameters<typeof serviceVersionArchiveNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_VERSION_ARCHIVE']['getByName']
    >
  >;
  getServiceActorVersionRepo(
    key: Parameters<typeof serviceActorVersionRepoNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_ACTOR_VERSION_REPO']['getByName']
    >
  >;
  getServiceActorVersionChain(
    key: Parameters<typeof serviceActorVersionChainNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_ACTOR_VERSION_CHAIN']['getByName']
    >
  >;
  getServiceActorVersionArchive(
    key: Parameters<typeof serviceActorVersionArchiveNameUtils.makeName>[0],
  ): Promise<
    ReturnType<
      Cloudflare.IDORepoNamespaces['SERVICE_ACTOR_VERSION_ARCHIVE']['getByName']
    >
  >;
}

interface IOwnerReleaseWorkerBindings {
  ZEROSPIN_HOSTED_SERVICE_DISPATCH?: Pick<
    IOwnerReleaseWorkerBinding,
    | 'getServiceVersionRepo'
    | 'getServiceVersionChain'
    | 'getServiceVersionArchive'
    | 'validateServiceAdmission'
  >;
  [name: `ZEROSPIN_RELEASE_${string}`]: IOwnerReleaseWorkerBinding | undefined;
}

declare global {
  namespace Cloudflare {
    interface Env extends IOwnerReleaseWorkerBindings {}
  }
}
