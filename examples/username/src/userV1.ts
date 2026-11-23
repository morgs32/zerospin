import * as sdk from '@zerospin/sdk/browser';

import { userModel } from './userModel';

export const userV1 = sdk.makeModelVersion(userModel, {
  version: 1,
  attributes: { username: sdk.primitives.text({ nullable: true }) },
  indexes: [],
});
