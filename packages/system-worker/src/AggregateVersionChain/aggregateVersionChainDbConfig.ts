import { makeDbConfig } from '@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig';
import { makeTable, primitives } from '@zerospin/shapes';

export const aggregateVersionChainDbConfig = makeDbConfig({
  tables: {
    historyHead: makeTable({
      name: 'historyHead',
      shape: {
        singletonId: primitives.integer({ primaryKey: true }),
        aggregateIndex: primitives.integer(),
        commandId: primitives.text({ nullable: true }),
        dispositionChainHash: primitives.text(),
      },
    }),
    archives: makeTable({
      name: 'archives',
      shape: {
        firstAggregateIndex: primitives.integer({ primaryKey: true }),
      },
    }),
    actorVersionChainFanoutSubscribers: makeTable({
      name: 'actorVersionChainFanoutSubscribers',
      shape: {
        actorName: primitives.text(),
        actorPath: primitives.text(),
        acknowledgedAggregateIndex: primitives.integer(),
      },
      indexes: [
        {
          name: 'actor_version_chain_fanout_subscriber_identity',
          columns: ['actorName', 'actorPath'],
          unique: true,
        },
      ],
    }),
    agentVersionChainFanoutSubscribers: makeTable({
      name: 'agentVersionChainFanoutSubscribers',
      shape: {
        agentName: primitives.text(),
        agentVersion: primitives.integer(),
        acknowledgedAggregateIndex: primitives.integer(),
      },
      indexes: [
        {
          name: 'agent_version_chain_fanout_subscriber_identity',
          columns: ['agentName', 'agentVersion'],
          unique: true,
        },
      ],
    }),
  },
});
