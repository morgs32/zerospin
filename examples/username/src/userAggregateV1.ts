import { defineAggregate } from '@zerospin/core/aggregate/defineAggregate';
import { makeAggregateRelease } from '@zerospin/core/aggregate/make/makeAggregateRelease';

import { createUserV1 } from './createUserV1';
import { updateUsernameV1 } from './updateUsernameV1';
import { userActorV1 } from './userActorV1';
import { userV1 } from './userV1';

export const userAggregateV1 = makeAggregateRelease(
  defineAggregate({ name: 'user' }),
  {
    version: 1,
    models: { user: userV1 },
    system: { createUser: createUserV1, updateUsername: updateUsernameV1 },
    actors: { user: userActorV1 },
  },
);
