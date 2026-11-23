import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyServiceRelease } from '@zerospin/core/service/types';
import { System } from '@zerospin/core/system/System';
import { getByKeyOrThrow } from '@zerospin/core/utils/getByKeyOrThrow';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError } from '@zerospin/error';
import type { IServiceCommandOccurrence } from '@zerospin/system-worker/ServiceChain/types';
import { env } from 'cloudflare:workers';
import type * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import type * as Semaphore from 'effect/Semaphore';

import { materializeCommandTx } from '../materializeCommandTx.js';
import { readEvaluatedCommand } from '../readEvaluatedCommand.js';
import { readServiceMaterializationHead } from '../readServiceMaterializationHead.js';
import type { replayCommand } from '../replayCommands/replayCommand.js';
import type { replayCommandsFanoutSubscriber } from '../replayCommandsFanoutSubscriber/replayCommandsFanoutSubscriber.js';

declare global {
  namespace Cloudflare {
    interface Env {
      ZEROSPIN_SERVICE_EXECUTION?: {
        startServiceExecution(serviceIndex: number): Promise<string>;
      };
    }
  }
}

type IReplaySubscriber = Effect.Success<
  ReturnType<
    typeof replayCommandsFanoutSubscriber<
      Effect.Error<ReturnType<typeof replayCommand>>,
      never
    >
  >
>;

/** Recover committed originals before catch-up; resolve fresh execution under the permit. */
export const executeCommand = Effect.fn('ServiceVersionRepo.executeCommand')(
  function* (props: {
    db: IDb;
    key: {
      systemId: string;
      serviceName: string;
      serviceVersion: number;
    };
    command: IServiceCommandOccurrence;
    builds?: ReadonlyMap<string, IAnyServiceRelease> | undefined;
    execution: Semaphore.Semaphore;
    replayThrough(index: number): ReturnType<IReplaySubscriber['catchup']>;
  }) {
    const { db, key, command, execution, replayThrough } = props;
    if (command.serviceName !== key.serviceName) {
      return yield* makeZerospinError('service-command-owner-mismatch');
    }
    if (command.serviceVersion !== key.serviceVersion) {
      return yield* makeZerospinError('service-original-version-mismatch');
    }
    if (command.outcome !== null) {
      return yield* makeZerospinError('service-original-delivery-invalid');
    }
    if (
      !Number.isSafeInteger(command.serviceIndex) ||
      command.serviceIndex < 1
    ) {
      return yield* makeZerospinError('service-execution-gap');
    }
    if (
      command.serviceIndex <= readServiceMaterializationHead(db).serviceIndex
    ) {
      return yield* readEvaluatedCommand({
        db,
        key,
        serviceIndex: command.serviceIndex,
        command,
      });
    }
    yield* Effect.promise(() => replayThrough(command.serviceIndex - 1)).pipe(
      Effect.flatMap(readRpcEnvelope),
    );
    const context: Context.Context<unknown> = yield* Effect.context<unknown>();
    const committed = yield* execution.withPermits(1)(
      Effect.gen(function* () {
        if (
          command.serviceIndex <=
          readServiceMaterializationHead(db).serviceIndex
        ) {
          return;
        }
        let serviceRelease: IAnyServiceRelease;
        if (props.builds === undefined) {
          const system = yield* System;
          const registry = yield* getByKeyOrThrow({
            record: system.services,
            key: key.serviceName,
            recordKind: 'services',
          });
          serviceRelease = yield* getByKeyOrThrow({
            record: registry.releases,
            key: key.serviceVersion,
            recordKind: 'listed versions',
          });
        } else {
          const authority = env.ZEROSPIN_SERVICE_EXECUTION;
          if (authority === undefined) {
            return yield* makeZerospinError(
              'service-execution-authority-unavailable',
            );
          }
          const buildId = yield* Effect.tryPromise({
            try: () => authority.startServiceExecution(command.serviceIndex),
            catch: cause =>
              makeZerospinError({
                code: 'service-execution-authority-unavailable',
                cause: String(cause),
              }),
          });
          const build = props.builds.get(buildId);
          if (build === undefined) {
            return yield* makeZerospinError(
              'service-execution-build-unavailable',
            );
          }
          serviceRelease = build;
        }
        return yield* materializeCommandTx(db, {
          row: command,
          serviceRelease,
          key,
          mode: 'original',
        }).pipe(Effect.provideContext(context));
      }),
    );
    // Publication can already have deleted the local outbox. Recovery RPC stays outside the permit.
    if (committed === undefined) {
      return yield* readEvaluatedCommand({
        db,
        key,
        serviceIndex: command.serviceIndex,
        command,
      });
    }
    return committed;
  },
  Effect.scoped,
);
