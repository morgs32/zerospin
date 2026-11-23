import type * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { admit } from './admit/admit.js';
import { Initialized } from './Initialized.js';

/** Retains owner identity and exposes a schema-backed admission method. */
export class ServiceApi extends makeRpcApi('ServiceApi', { admit }) {
  constructor(ownerIdentity: Context.Service.Shape<typeof Initialized>) {
    super(Layer.succeed(Initialized, ownerIdentity));
  }
}
