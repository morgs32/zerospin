import type * as Context from 'effect/Context';
import * as Layer from 'effect/Layer';

import { makeRpcApi } from '../makeRpcApi/makeRpcApi.js';

import { createWebSocketTicket } from './createWebSocketTicket/createWebSocketTicket.js';
import { getBrowserCommands } from './getBrowserCommands/getBrowserCommands.js';
import { getSnapshot } from './getSnapshot/getSnapshot.js';
import { Initialized } from './Initialized.js';
import { registerNode } from './registerNode/registerNode.js';

/** Authorized session capability with generated schema-backed methods. */
export class AggregateSessionApi extends makeRpcApi('AggregateSessionApi', {
  getBrowserCommands,
  getSnapshot,
  createWebSocketTicket,
  registerNode,
}) {
  constructor(authResults: Context.Service.Shape<typeof Initialized>) {
    super(Layer.succeed(Initialized, authResults));
  }
}
