import * as sdk from '@zerospin/sdk/browser';
import * as Effect from 'effect/Effect';

import { userId } from './userId';
import { userModel } from './userModel';
import { userV1 } from './userV1';

export const createUserV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('createUser'),
  {
    version: 1,
    payload: { id: sdk.modelId({ model: userModel }) },
    models: { user: { model: userV1, fields: [] } },
    failures: {
      invalidId: sdk.ContractError.schema({ code: 'invalid-user-id' }),
      userExists: sdk.ContractError.schema({ code: 'user-already-exists' }),
    },
    guard: Effect.fn('createUser.guard')(function* ({ db, failures, payload }) {
      if (payload.id !== userId) {
        return yield* failures.invalidId.make({
          message: 'Expected usr_user.',
        });
      }
      const user = yield* sdk.findFirst({
        db,
        model: db.models.user,
        where: { id: { eq: userId } },
      });
      if (user !== undefined) {
        return yield* failures.userExists.make({
          message: 'The user already exists.',
        });
      }
    }),
    operations: { create: userV1.operations.create },
    program: ({ payload, operations }) =>
      operations.create({
        resourceId: payload.id,
        attributes: { username: null },
      }),
  },
);
