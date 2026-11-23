import type * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { authorize } from './authorize/authorize.js';
import { Initialized } from './Initialized.js';

/** Retained access capability with a schema-backed authorize method. */
export class ServiceAccessApi extends makeRpcApi('ServiceAccessApi', {
  authorize,
}) {
  constructor(access: Context.Service.Shape<typeof Initialized>) {
    super(Layer.succeed(Initialized, access));
  }
}
