import type {
  IAggregateAgentNodeRpc,
  IServiceAgentNodeRpc,
} from '../../agentNodeRepo/agentNodeBindings.js';
import type { AggregateActorVersionArchive } from '../../AggregateActorVersionArchive/AggregateActorVersionArchive.js';
import type { AggregateActorVersionChain } from '../../AggregateActorVersionChain/AggregateActorVersionChain.js';
import type { AggregateActorVersionRepo } from '../../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import type { AggregateAgentVersionChain } from '../../AggregateAgentVersionChain/AggregateAgentVersionChain.js';
import type { AggregateAgentVersionRepo } from '../../AggregateAgentVersionRepo/AggregateAgentVersionRepo.js';
import type { AggregateChain } from '../../AggregateChain/AggregateChain.js';
import type { AggregateVersionArchive } from '../../AggregateVersionArchive/AggregateVersionArchive.js';
import type { AggregateVersionChain } from '../../AggregateVersionChain/AggregateVersionChain.js';
import type { IAggregateVersionRepo } from '../../AggregateVersionRepo/types.js';
import type { ServiceActorVersionArchive } from '../../ServiceActorVersionArchive/ServiceActorVersionArchive.js';
import type { ServiceActorVersionChain } from '../../ServiceActorVersionChain/ServiceActorVersionChain.js';
import type { ServiceActorVersionRepo } from '../../ServiceActorVersionRepo/ServiceActorVersionRepo.js';
import type { ServiceAgentVersionChain } from '../../ServiceAgentVersionChain/ServiceAgentVersionChain.js';
import type { ServiceAgentVersionRepo } from '../../ServiceAgentVersionRepo/ServiceAgentVersionRepo.js';
import type { ServiceChain } from '../../ServiceChain/ServiceChain.js';
import type { ServiceVersionArchive } from '../../ServiceVersionArchive/ServiceVersionArchive.js';
import type { ServiceVersionChain } from '../../ServiceVersionChain/ServiceVersionChain.js';
import type { IServiceVersionRepo } from '../../ServiceVersionRepo/types.js';
import type { SystemRepo } from '../SystemRepo.js';

/** Namespace names stay explicit so deriving the base never inspects its subclasses. */
declare global {
  namespace Cloudflare {
    interface IDORepoNamespaces {
      SYSTEM_REPO: {
        getByName(
          name: string,
          options?: DurableObjectNamespaceGetDurableObjectOptions,
        ): Pick<
          SystemRepo,
          | 'initialize'
          | 'preflightDeployment'
          | 'registerSystemSpec'
          | 'acceptServiceBuild'
          | 'readAcceptedServiceBuild'
          | 'startServiceExecution'
          | 'getServiceExecutionBuild'
          | 'getExecutingWorkerVersion'
          | 'hasAcceptedSystemSpec'
          | 'getAcceptedSystemSpec'
          | 'hasArchiveBackedAggregateHistory'
          | 'hasVersionBoundAgentInstallationStorage'
          | 'getSelectedAggregateAgentInstallations'
          | 'hasOrdinaryContinuationStorage'
          | 'createSessionWebSocketTicket'
          | 'registerRepo'
          | 'registerAggregate'
          | 'getAggregateIds'
          | 'hasAggregate'
          | 'getRepoRegistrations'
          | 'getRepoTableRows'
        >;
      };
      AGGREGATE_AGENT_NODE_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & IAggregateAgentNodeRpc
      >;
      SERVICE_AGENT_NODE_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & IServiceAgentNodeRpc
      >;
      AGGREGATE_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & IAggregateVersionRepo
      >;
      AGGREGATE_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateVersionChain
      >;
      AGGREGATE_ACTOR_VERSION_ARCHIVE: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateActorVersionArchive
      >;
      AGGREGATE_VERSION_ARCHIVE: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateVersionArchive
      >;
      AGGREGATE_ACTOR_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateActorVersionRepo
      >;
      AGGREGATE_AGENT_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateAgentVersionRepo
      >;
      SERVICE_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceVersionChain
      >;
      SERVICE_ACTOR_VERSION_ARCHIVE: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceActorVersionArchive
      >;
      SERVICE_VERSION_ARCHIVE: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceVersionArchive
      >;
      SERVICE_ACTOR_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceActorVersionRepo
      >;
      SERVICE_AGENT_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceAgentVersionRepo
      >;
      SERVICE_AGENT_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceAgentVersionChain
      >;
      SERVICE_VERSION_REPO: DurableObjectNamespace<
        Rpc.DurableObjectBranded & IServiceVersionRepo
      >;
      AGGREGATE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateChain
      >;
      AGGREGATE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateActorVersionChain
      >;
      AGGREGATE_AGENT_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & AggregateAgentVersionChain
      >;
      SERVICE_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceChain
      >;
      SERVICE_ACTOR_VERSION_CHAIN: DurableObjectNamespace<
        Rpc.DurableObjectBranded & ServiceActorVersionChain
      >;
    }
  }
}
