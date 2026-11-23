import * as sdk from '@zerospin/sdk/browser';

import { userV1 } from './userV1';

export const updateUsernameV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('updateUsername'),
  {
    version: 1,
    payload: { username: sdk.primitives.text({ nullable: true }) },
    models: { user: { model: userV1, fields: ['username'] } },
    operations: { update: userV1.operations.update },
    program: ({ db, payload, operations }) => {
      // TODO Read userId from db.models.user. The usr_user row is assumed present.
      // operations.update({ resourceId: row.id, attributes: { username: payload.username } })
      // See updateCounter in packages/system-worker/tests/aggregate-time/system.ts.
    },
  },
);
