import * as sdk from '@zerospin/sdk/browser';

import { userModel } from './userModel';
import { userV1 } from './userV1';

export const createUserV1 = sdk.makeAggregateContractRelease(
  sdk.defineAggregateContract('createUser'),
  {
    version: 1,
    payload: { id: sdk.modelId({ model: userModel }) },
    models: { user: { model: userV1, fields: [] } },
    operations: { create: userV1.operations.create },
    program: ({ payload, operations }) => {
      // TODO Refuse a second create of usr_user. Both setup paths pass userId.
      // operations.create({ resourceId: payload.id, attributes: { username: null } })
      // See examples/tic-tac-toe/src/contracts/createGameV1.ts.
    },
  },
);
