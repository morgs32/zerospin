import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { OwnerReleaseIdentitySchema } from '@zerospin/core/system/ownerReleaseDeployment';
import { SystemSpecSchema } from '@zerospin/core/system/SystemSpecSchema';
import { makeTable, primitives, type IAnyTables } from '@zerospin/shapes';
import * as Schema from 'effect/Schema';

import { SessionAdmissionSchema } from './sessionWebSocketTickets/SessionAdmissionSchema.js';

export const systemRepoDbConfig = makeDbConfig({
  tables: {
    acceptedSystemSpecs: makeTable({
      name: 'acceptedSystemSpecs',
      shape: {
        hash: primitives.text({ unique: true }),
        spec: primitives.json({
          schema: SystemSpecSchema,
        }),
        ownerReleases: primitives.json({
          schema: Schema.Array(OwnerReleaseIdentitySchema),
        }),
      },
    }),
    sessionWebSocketTickets: makeTable({
      name: 'sessionWebSocketTickets',
      shape: {
        ticketHash: primitives.text({ unique: true }),
        sessionFamily: primitives.enum({ values: ['aggregate', 'service'] }),
        admission: primitives.json({ schema: SessionAdmissionSchema }),
        expiresAt: primitives.date(),
      },
    }),
    aggregates: makeTable({
      name: 'aggregates',
      shape: {
        aggregateName: primitives.text(),
        aggregateId: primitives.text(),
      },
      indexes: [
        {
          name: 'aggregates_aggregate_name_aggregate_id_unique',
          columns: ['aggregateName', 'aggregateId'],
          unique: true,
        },
      ],
    }),
    repos: makeTable({
      name: 'repos',
      shape: {
        repoType: primitives.text(),
        repoName: primitives.text(),
        tableNames: primitives.json({
          schema: Schema.Array(Schema.String),
        }),
      },
      indexes: [
        {
          name: 'repos_repo_type_repo_name_unique',
          columns: ['repoType', 'repoName'],
          unique: true,
        },
      ],
    }),
  } satisfies IAnyTables,
});
