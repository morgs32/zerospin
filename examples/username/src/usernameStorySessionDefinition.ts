import { makeAggregateSessionDefinition } from '@zerospin/browser';
import * as Schema from 'effect/Schema';

import { createUserV1 } from './createUserV1';
import { updateUsernameV1 } from './updateUsernameV1';
import { userV1 } from './userV1';

export const usernameStorySessionDefinition = makeAggregateSessionDefinition({
  systemName: 'standalone',
  aggregateName: 'user',
  aggregateVersion: 1,
  actorName: 'user',
  actorVersion: 1,
  sessionName: 'usernameStory',
  claimsSchema: Schema.Struct({ aggregateId: Schema.String }),
  models: { user: userV1 },
  // Story setup stages createUser here. The hosted user actor authorizer is the other caller.
  contracts: { createUser: createUserV1, updateUsername: updateUsernameV1 },
});
