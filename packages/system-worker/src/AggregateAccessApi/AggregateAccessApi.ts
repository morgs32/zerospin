import type * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { Initialized } from './Initialized.js';
import { openSession } from './openSession/openSession.js';

/** Retained access capability with a schema-backed openSession method. */
export class AggregateAccessApi extends makeRpcApi('AggregateAccessApi', {
  openSession,
}) {
  constructor(access: Context.Service.Shape<typeof Initialized>) {
    super(Layer.succeed(Initialized, access));
  }
}
