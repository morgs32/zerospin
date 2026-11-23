import { makeSystem } from '@zerospin/core/system/make/makeSystem/makeSystem';

import { userAggregateV1 } from './userAggregateV1';

export const system = makeSystem({
  name: 'username',
  aggregates: { user: { releases: { 1: userAggregateV1 } } },
});
