import type { ISystemId } from '@zerospin/core/system/types';
import type { ISystemApiRpc } from '@zerospin/core/systemApi/ISystemApiRpc';
import * as Layer from 'effect/Layer';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { acceptSystemSpec } from './acceptSystemSpec/acceptSystemSpec.js';
import { executeAggregateCommand } from './executeAggregateCommand/executeAggregateCommand.js';
import { executeAggregateQuery } from './executeAggregateQuery/executeAggregateQuery.js';
import { executeServiceCommand } from './executeServiceCommand/executeServiceCommand.js';
import { executeServiceQuery } from './executeServiceQuery/executeServiceQuery.js';
import { getAgentAggregateIds } from './getAgentAggregateIds/getAgentAggregateIds.js';
import { getExecutingWorkerVersion } from './getExecutingWorkerVersion/getExecutingWorkerVersion.js';
import { getRepoRegistrations } from './getRepoRegistrations/getRepoRegistrations.js';
import { getRepoTableRows } from './getRepoTableRows/getRepoTableRows.js';
import { healthcheck } from './healthcheck/healthcheck.js';
import { initialize } from './initialize/initialize.js';
import { Initialized } from './Initialized.js';
import { makeSystemSpec } from './makeSystemSpec/makeSystemSpec.js';
import { openAggregateAgentSession } from './openAggregateAgentSession/openAggregateAgentSession.js';
import { openServiceAgentSession } from './openServiceAgentSession/openServiceAgentSession.js';
import { preflightDeployment } from './preflightDeployment/preflightDeployment.js';

/** Deployment-scoped system capability. All public calls use schema-backed method definitions. */
export class SystemApi
  extends makeRpcApi('SystemApi', {
    openAggregateAgentSession,
    openServiceAgentSession,
    getAgentAggregateIds,
    healthcheck,
    initialize,
    executeServiceQuery,
    executeAggregateCommand,
    executeAggregateQuery,
    executeServiceCommand,
    getRepoRegistrations,
    getRepoTableRows,
    preflightDeployment,
    acceptSystemSpec,
    getExecutingWorkerVersion,
    makeSystemSpec,
  })
  implements ISystemApiRpc
{
  constructor(systemId: ISystemId) {
    super(Layer.succeed(Initialized, { systemId }));
  }
}
