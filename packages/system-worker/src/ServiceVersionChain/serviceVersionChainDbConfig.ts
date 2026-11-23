import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

import { evaluatedServiceCommandShape } from './evaluatedServiceCommand.js';

export const serviceVersionChainDbConfig = makeDbConfig({
  tables: {
    commands: makeTable({
      name: 'commands',
      shape: evaluatedServiceCommandShape,
    }),
    historyHead: makeTable({
      name: 'historyHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        serviceIndex: primitives.integer(),
        commandId: primitives.text({ nullable: true }),
        dispositionChainHash: primitives.text(),
      },
    }),
    archives: makeTable({
      name: 'archives',
      shape: { firstServiceIndex: primitives.integer({ primaryKey: true }) },
    }),
    archiveFanoutSubscribers: makeTable({
      name: 'archiveFanoutSubscribers',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        acknowledgedServiceIndex: primitives.integer(),
      },
    }),
    agentVersionRepoFanoutSubscribers: makeTable({
      name: 'agentVersionRepoFanoutSubscribers',
      shape: {
        agentName: primitives.text(),
        agentVersion: primitives.integer(),
        acknowledgedServiceIndex: primitives.integer(),
      },
      indexes: [
        {
          name: 'agent_version_repo_fanout_subscriber_identity',
          columns: ['agentName', 'agentVersion'],
          unique: true,
        },
      ],
    }),
    actorVersionRepoFanoutSubscribers: makeTable({
      name: 'actorVersionRepoFanoutSubscribers',
      shape: {
        actorName: primitives.text(),
        actorPath: primitives.text(),
        acknowledgedServiceIndex: primitives.integer(),
      },
      indexes: [
        {
          name: 'actor_version_repo_fanout_subscriber_identity',
          columns: ['actorName', 'actorPath'],
          unique: true,
        },
      ],
    }),
  },
});
