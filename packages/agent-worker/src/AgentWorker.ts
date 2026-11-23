import { configureAuthoredWorker } from '@zerospin/system-worker/workerConfiguration/workerConfiguration';
import { WorkerEntrypoint } from 'cloudflare:workers';
import config from 'config';

export {
  AggregateAgentVersionChain,
  AggregateAgentVersionRepo,
  ServiceAgentVersionChain,
  ServiceAgentVersionRepo,
} from '@zerospin/system-worker';

export {
  AggregateAgentNodeRepo,
  ServiceAgentNodeRepo,
} from './AgentNodeRepos.js';

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoints are default exports.
export default class AgentWorker extends WorkerEntrypoint {
  override fetch(): Response {
    return new Response(null, { status: 404 });
  }
}

configureAuthoredWorker(config);
