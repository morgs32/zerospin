import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { userId } from './userId';
import { userV1 } from './userV1';

export const updateUsernameV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('updateUsername'),
  {
    version: 1,
    payload: { username: sdk.primitives.text({ nullable: true }) },
    models: { user: { model: userV1, fields: ['username'] } },
    failures: {
      userMissing: sdk.ContractError.schema({ code: 'user-missing' }),
    },
    operations: { update: userV1.operations.update },
    program: Effect.fn('updateUsername.program')(function* ({
      db,
      failures,
      payload,
      operations,
    }) {
      const user = yield* sdk.findFirst({
        db,
        model: db.models.user,
        where: { id: { eq: userId } },
      });
      if (user === undefined) {
        return yield* failures.userMissing.make({
          message: 'Create the user before updating its username.',
        });
      }
      yield* operations.update({
        resourceId: user.id,
        attributes: { username: payload.username },
      });
    }),
  },
);
