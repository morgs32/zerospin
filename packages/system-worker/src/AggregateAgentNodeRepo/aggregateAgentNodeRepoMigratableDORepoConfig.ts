import { RoutePattern } from '@remix-run/route-pattern';
import * as Schema from 'effect/Schema';

import { agentCommandJournalMigration } from '../agentNodeRepo/agentNodeRepoDbConfig.js';
import { makeMigratableDORepoConfig } from '../makeMigratableDORepo/makeMigratableDORepoConfig.js';
import { systemWorkerAbbreviations } from '../systemWorkerAbbreviations.js';

import {
  aggregateAgentNodeRepoBaseline,
  aggregateAgentNodeRepoDbConfig,
} from './aggregateAgentNodeRepoDbConfig.js';

export const aggregateAgentNodeRepoMigratableDORepoConfig =
  makeMigratableDORepoConfig({
    migrations: [
      {
        ...agentCommandJournalMigration,
        sourceTables: aggregateAgentNodeRepoBaseline.definition.provisioning,
      },
    ],
    abbreviation: systemWorkerAbbreviations.aggregateAgentNodeRepo,
    keyCodec: Schema.Struct({
      systemId: Schema.String,
      aggregateId: Schema.String,
      aggregateName: Schema.String,
      agentName: Schema.String,
    }),
    namePattern: RoutePattern.parse(
      '/:systemId/:aggregateName/:aggregateId/:agentName',
    ),
    dbConfig: aggregateAgentNodeRepoDbConfig,
  });
