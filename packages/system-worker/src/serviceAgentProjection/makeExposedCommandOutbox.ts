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
import { RepoServicesLive } from '../repoServices/RepoServicesLive.js';
import { ServiceAgentVersionChains } from '../repoServices/ServiceAgentVersionChains.js';
import type { IWorkerInvocationRunner } from '../runWorkerInvocation/runWorkerInvocation.js';

import { type IServiceAgentProjectionKey } from './resolveServiceAgentView.js';
import {
  serviceAgentProjectionDbConfig,
  type IServiceAgentExposedPublication,
} from './serviceAgentProjectionDbConfig.js';

export type IExposedCommandOutbox = IWorkerOutboxQueue<
  'exposedCommandOutbox',
  IServiceAgentExposedPublication,
  void,
  IZerospinError | IZerospinErrorJson
>;

/** Publish complete selected output independently of resource application and delete only after durable acknowledgement. */
export function makeExposedCommandOutbox<R>(props: {
  db: IDb;
  key: IServiceAgentProjectionKey;
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
    outboxTable: serviceAgentProjectionDbConfig.schema.exposedCommandOutbox,
    indexColumnName: 'serviceIndex',
    prepare: rows =>
      Effect.gen(function* () {
        return yield* Effect.forEach(rows, row =>
          serviceAgentProjectionDbConfig.tables.exposedCommandOutbox
            .decodeRow(row)
            .pipe(
              mapParseError({
                code: 'exposed-command-outbox-invalid',
                prefix: 'Invalid pending exposed service command',
              }),
            ),
        );
      }).pipe(Effect.provide(RepoServicesLive)),
    subscriber: (): Effect.Effect<
      IOutboxSubscriber<IExposedCommandOutbox, IZerospinErrorJson>,
      IZerospinError
    > =>
      Effect.gen(function* () {
        const chain = yield* (yield* ServiceAgentVersionChains).getRepo({
          key,
        });
        return {
          receive: (commands: readonly IServiceAgentExposedPublication[]) =>
            chain.appendExposedCommands({ sourceKey: key, commands }),
        };
      }).pipe(Effect.provide(RepoServicesLive)),
  });
}
