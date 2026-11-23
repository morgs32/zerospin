import { RoutePattern } from '@remix-run/route-pattern';
import * as Schema from 'effect/Schema';

import { agentCommandJournalMigration } from '../agentNodeRepo/agentNodeRepoDbConfig.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import {
  serviceAgentNodeRepoBaseline,
  serviceAgentNodeRepoDbConfig,
} from './serviceAgentNodeRepoDbConfig.js';

export const serviceAgentNodeRepoMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [
      {
        ...agentCommandJournalMigration,
        sourceTables: serviceAgentNodeRepoBaseline.definition.provisioning,
      },
    ],
    abbreviation: systemWorkerAbbreviations.serviceAgentNodeRepo,
    keyCodec: Schema.Struct({
      systemId: Schema.String,
      serviceName: Schema.String,
      agentName: Schema.String,
    }),
    namePattern: RoutePattern.parse('/:systemId/:serviceName/:agentName'),
    dbConfig: serviceAgentNodeRepoDbConfig,
  });
