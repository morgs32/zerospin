import { makeAggregateSessionDefinition } from '@zerospin/browser';
import * as Schema from 'effect/Schema';

import { addListItemV1 } from './addListItemV1';
import { listItemV1 } from './listItemV1';

export const listStorySessionDefinition = makeAggregateSessionDefinition({
  systemName: 'standalone',
  aggregateName: 'list',
  aggregateVersion: 1,
  actorName: 'storybook',
  actorVersion: 1,
  sessionName: 'listStory',
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: { listItem: listItemV1 },
  contracts: { addListItem: addListItemV1 },
});
