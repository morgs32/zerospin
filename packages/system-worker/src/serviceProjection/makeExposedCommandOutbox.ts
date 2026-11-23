import type { IDb } from '@zerospin/core/drizzle/types';
import type { IOutboxSubscriber } from '@zerospin/core/outbox/IOutboxSubscriber';
import {
  mapParseError,
  type IZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { RpcTarget } from 'cloudflare:workers';
import * as Effect from 'effect/Effect';
import type * as ManagedRuntime from 'effect/ManagedRuntime';

import {
  makeOutboxQueue,
  type IWorkerOutboxQueue,
} from '../makeOutboxQueue/makeOutboxQueue.js';
import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { ServiceActorVersionChains } from '../repoServices/ServiceActorVersionChains.js';
import { ServiceProjectionReposLive } from '../repoServices/ServiceProjectionReposLive.js';
import type { IWorkerInvocationRunner } from '../runWorkerInvocation/runWorkerInvocation.js';

import type { IServiceProjectionKey } from './resolveServiceActorView.js';
import {
  serviceProjectionDbConfig,
  type IServiceExposedPublication,
} from './serviceProjectionDbConfig.js';

export type IExposedCommandOutbox = IWorkerOutboxQueue<
  'exposedCommandOutbox',
  IServiceExposedPublication,
  void,
  IZerospinError | IZerospinErrorJson
>;

/** Publish complete selected output independently of resource application and delete only after durable acknowledgement. */
export function makeExposedCommandOutbox<R>(props: {
  db: IDb;
  key: IServiceProjectionKey;
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<R, unknown>;
  recoveryRegistry: IRecoveryRegistry;
  runInvocation: IWorkerInvocationRunner;
  background: (promise: Promise<unknown>) => void;
}): IExposedCommandOutbox {
  const {
    db,
    key,
    RpcTarget: OutboxRpcTarget,
    managedRuntime,
    recoveryRegistry,
    runInvocation,
    background,
  } = props;
  return makeOutboxQueue({
    db,
    RpcTarget: OutboxRpcTarget,
    managedRuntime,
    recoveryRegistry,
    runInvocation,
    background,
    name: 'exposedCommandOutbox',
    outboxTable: serviceProjectionDbConfig.schema.exposedCommandOutbox,
    indexColumnName: 'serviceIndex',
    prepare: rows =>
      Effect.forEach(rows, row =>
        serviceProjectionDbConfig.tables.exposedCommandOutbox
          .decodeRow(row)
          .pipe(
            mapParseError({
              code: 'exposed-command-outbox-invalid',
              prefix: 'Invalid pending exposed service command',
            }),
          ),
      ),
    subscriber: (): Effect.Effect<
      IOutboxSubscriber<IExposedCommandOutbox, IZerospinErrorJson>,
      IZerospinError
    > =>
      Effect.gen(function* () {
        const chain = yield* (yield* ServiceActorVersionChains).getRepo({
          key,
        });
        return {
          receive: (commands: readonly IServiceExposedPublication[]) =>
            chain.appendExposedCommands({ sourceKey: key, commands }),
        };
      }).pipe(Effect.provide(ServiceProjectionReposLive)),
  });
}
