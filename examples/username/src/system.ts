import * as sdk from '@zerospin/sdk';

import { userAggregateV1 } from './userAggregateV1';

export const system = sdk.makeSystem({
  name: 'username',
  aggregates: { user: { releases: { 1: userAggregateV1 } } },
});
