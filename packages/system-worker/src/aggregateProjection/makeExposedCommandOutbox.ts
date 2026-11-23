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
import * as Schema from 'effect/Schema';

import {
  AggregateExposedPublicationSchema,
  type IAggregateAgentExposedPublication,
  type IAggregateExposedPublication,
} from '../aggregateSessionChain/aggregateExposedPublication.js';
import {
  makeOutboxQueue,
  type IWorkerOutboxQueue,
} from '../makeOutboxQueue/makeOutboxQueue.js';
import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import { AggregateActorVersionChains } from '../repoServices/AggregateActorVersionChains.js';
import { AggregateAgentVersionChains } from '../repoServices/AggregateAgentVersionChains.js';
import { AggregateProjectionReposLive } from '../repoServices/AggregateProjectionReposLive.js';
import type { IWorkerInvocationRunner } from '../runWorkerInvocation/runWorkerInvocation.js';

import {
  aggregateAgentProjectionDbConfig,
  aggregateProjectionDbConfig,
} from './aggregateProjectionDbConfig.js';
import { decodeAgentOutboxPublication } from './decodeAgentOutboxPublication.js';
import type { IAggregateProjectionKey } from './resolveAggregateProjectionView.js';

export type IExposedCommand =
  | IAggregateExposedPublication
  | IAggregateAgentExposedPublication;
export type IExposedCommandOutbox = IWorkerOutboxQueue<
  'exposedCommandOutbox',
  IExposedCommand,
  void,
  IZerospinError | IZerospinErrorJson
>;

/** Each projection publication is self-contained and deleted only after its exact history Chain commits it. */
export function makeExposedCommandOutbox<R>(props: {
  db: IDb;
  key: IAggregateProjectionKey;
  RpcTarget: typeof RpcTarget;
  managedRuntime: ManagedRuntime.ManagedRuntime<R, unknown>;
  recoveryRegistry: IRecoveryRegistry;
  runInvocation: IWorkerInvocationRunner;
  background: (promise: Promise<unknown>) => void;
}): IExposedCommandOutbox {
  const { key } = props;
  return makeOutboxQueue({
    ...props,
    name: 'exposedCommandOutbox',
    outboxTable:
      'actorName' in key
        ? aggregateProjectionDbConfig.schema.exposedCommandOutbox
        : aggregateAgentProjectionDbConfig.schema.exposedCommandOutbox,
    indexColumnName: 'aggregateIndex',
    prepare: (rows: readonly unknown[]) =>
      Effect.forEach(rows, row =>
        Effect.gen(function* () {
          if ('actorName' in key) {
            return yield* aggregateProjectionDbConfig.tables.exposedCommandOutbox
              .decodeRow(row)
              .pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(
                    Schema.toType(AggregateExposedPublicationSchema),
                  ),
                ),
                mapParseError({
                  code: 'exposed-command-outbox-invalid',
                  prefix: 'Invalid pending exposed command',
                }),
              );
          }
          return yield* decodeAgentOutboxPublication({ row }).pipe(
            Effect.provide(AggregateProjectionReposLive),
            mapParseError({
              code: 'exposed-command-outbox-invalid',
              prefix: 'Invalid pending Agent exposed command',
            }),
          );
        }),
      ),
    subscriber: (): Effect.Effect<
      IOutboxSubscriber<IExposedCommandOutbox, IZerospinErrorJson>,
      IZerospinError
    > =>
      Effect.gen(function* () {
        const chain =
          'actorName' in key
            ? yield* (yield* AggregateActorVersionChains).getRepo({ key })
            : yield* (yield* AggregateAgentVersionChains).getRepo({ key });
        return {
          receive: (commands: readonly IExposedCommand[]) =>
            chain.appendExposedCommands({ sourceKey: key, commands }),
        };
      }).pipe(Effect.provide(AggregateProjectionReposLive)),
  });
}
