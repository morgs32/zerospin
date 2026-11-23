import type * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { authenticate } from './authenticate/authenticate.js';
import { Initialized } from './Initialized.js';

/** Retains owner identity and exposes a schema-backed authentication method. */
export class AggregateApi extends makeRpcApi('AggregateApi', { authenticate }) {
  constructor(ownerIdentity: Context.Service.Shape<typeof Initialized>) {
    super(Layer.succeed(Initialized, ownerIdentity));
  }
}
