import type { IDb } from '@zerospin/core/drizzle/types';
import {
  ensureZerospinError,
  makeZerospinError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import type { RpcTarget as WorkerRpcTarget } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import type * as Scope from 'effect/Scope';
import * as Semaphore from 'effect/Semaphore';
import { isEqual } from 'es-toolkit';

import type { IAgentNodeExposedCommand } from '../agentNodeRepo/agentNodeRuntimeTypes.js';
import type { IFanoutDelivery } from '../makeFanoutQueue/makeFanoutQueue.js';
import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';
import type {
  IWorkerInvocationRunner,
  IWorkerRpcEncoder,
} from '../runWorkerInvocation/runWorkerInvocation.js';

import { agentNodeFanoutDbConfig } from './agentNodeFanoutDbConfig.js';

const acknowledgement =
  agentNodeFanoutDbConfig.schema.nodeDeliveryAcknowledgement;

export type IAgentNodeFanout<KEY> = WorkerRpcTarget & {
  readonly name: 'nodeFanout';
  readonly wake: () => Effect.Effect<void>;
  readonly producerLease: Effect.Effect<void, never, Scope.Scope>;
  getPage(props: {
    afterIndex: number;
    maxIndex?: number;
  }): Promise<
    IRpcEnvelope<IFanoutDelivery<IAgentNodeExposedCommand>, IZerospinErrorJson>
  >;
  subscribe(
    props: KEY & { currentIndex: number },
  ): Promise<IRpcEnvelope<void, IZerospinErrorJson>>;
};

/** Deliver retained public history to the one recipient derived from this Chain's identity. */
export function makeAgentNodeFanout<
  KEY extends Readonly<Record<string, string | number>>,
  R,
>(props: {
  RpcTarget: typeof WorkerRpcTarget;
  db: IDb;
  key: KEY;
  enabled: () => boolean;
  recoveryRegistry: IRecoveryRegistry;
  managedRuntime: ManagedRuntime.ManagedRuntime<R, unknown>;
  runInvocation: IWorkerInvocationRunner;
  encodeRpcOutcome: IWorkerRpcEncoder;
  background: (promise: Promise<unknown>) => void;
  readPage: (page: { afterIndex: number; maxIndex?: number }) => Effect.Effect<
    {
      rows: readonly { row: IAgentNodeExposedCommand; index: number }[];
      lastIndex: number;
    },
    unknown,
    R
  >;
  deliver: (
    delivery: IFanoutDelivery<IAgentNodeExposedCommand>,
  ) => Effect.Effect<void, unknown, R>;
}): IAgentNodeFanout<KEY> {
  const enabled = props.enabled.bind(props);
  const readPage = props.readPage.bind(props);
  const deliver = props.deliver.bind(props);
  const runInvocation = props.runInvocation.bind(props);
  const background = props.background.bind(props);
  const {
    db,
    key,
    recoveryRegistry,
    managedRuntime,
    RpcTarget,
    encodeRpcOutcome,
  } = props;
  const semaphore = Semaphore.makeUnsafe(1);
  let activeProducers = 0;
  let revision = 0;
  const drain = Effect.gen(function* () {
    const startedAtRevision = revision;
    yield* recoveryRegistry.hold('nodeFanout');
    if (enabled()) {
      let cursor = db
        .select()
        .from(acknowledgement)
        .where(eq(acknowledgement.singletonId, 1))
        .get()?.acknowledgedIndex;
      if (cursor !== undefined) {
        const { lastIndex: boundary } = yield* readPage({
          afterIndex: 0,
          maxIndex: 0,
        });
        while (cursor < boundary) {
          const page = yield* readPage({
            afterIndex: cursor,
            maxIndex: boundary,
          });
          const rows = page.rows.filter(entry => entry.index <= boundary);
          const through = rows.at(-1)?.index;
          if (through === undefined) {
            return yield* makeZerospinError('fanout-delivery-history-missing');
          }
          yield* deliver({
            rows: rows.map(entry => entry.row),
            lastIndex: page.lastIndex,
          });
          const retained = db
            .select()
            .from(acknowledgement)
            .where(eq(acknowledgement.singletonId, 1))
            .get();
          cursor = Math.max(retained?.acknowledgedIndex ?? 0, through);
          db.update(acknowledgement)
            .set({ acknowledgedIndex: cursor })
            .where(eq(acknowledgement.singletonId, 1))
            .run();
        }
      }
    }
    if (activeProducers === 0 && startedAtRevision === revision) {
      yield* recoveryRegistry.release('nodeFanout');
    }
  }).pipe(
    semaphore.withPermits(1),
    Effect.onExit(exit =>
      Exit.isFailure(exit) ? recoveryRegistry.hold('nodeFanout') : Effect.void,
    ),
  );
  recoveryRegistry.register('nodeFanout', drain);
  const start = () => {
    const settled = managedRuntime.runPromiseExit(runInvocation(drain));
    const retained = settled.then(exit =>
      Exit.isSuccess(exit)
        ? exit.value
        : Effect.runSync(Effect.failCause(exit.cause)),
    );
    void retained.catch(() => undefined);
    try {
      background(retained);
    } catch {
      /* The recovery hold retains delivery if host retention fails. */
    }
    return settled;
  };
  class AgentNodeFanout extends RpcTarget {
    readonly name = 'nodeFanout' as const;
    readonly producerLease = Effect.acquireRelease(
      Effect.gen(function* () {
        activeProducers += 1;
        yield* recoveryRegistry.hold('nodeFanout').pipe(
          Effect.onExit(exit =>
            Exit.isFailure(exit)
              ? Effect.sync(() => {
                  activeProducers -= 1;
                  revision += 1;
                })
              : Effect.void,
          ),
        );
      }),
      () =>
        Effect.sync(() => {
          activeProducers -= 1;
          revision += 1;
        }),
    );
    readonly wake = () =>
      Effect.gen(function* () {
        yield* recoveryRegistry.hold('nodeFanout');
        start();
      });

    getPage(page: { afterIndex: number; maxIndex?: number }) {
      return managedRuntime.runPromise(
        Effect.gen(function* () {
          if (
            !Number.isSafeInteger(page.afterIndex) ||
            page.afterIndex < 0 ||
            (page.maxIndex !== undefined &&
              (!Number.isSafeInteger(page.maxIndex) || page.maxIndex < 0))
          ) {
            return yield* makeZerospinError('fanout-page-invalid');
          }
          const result = yield* readPage(page);
          return {
            rows: result.rows.map(entry => entry.row),
            lastIndex: result.lastIndex,
          };
        }).pipe(
          Effect.mapError(error =>
            ensureZerospinError({ code: 'agent-node-fanout-failed', error }),
          ),
          encodeRpcOutcome,
        ),
      );
    }

    subscribe(input: KEY & { currentIndex: number }) {
      const wake = this.wake;
      const producerLease = this.producerLease;
      return managedRuntime.runPromise(
        Effect.gen(function* () {
          const { currentIndex, ...recipient } = input;
          if (!isEqual(recipient, key)) {
            return yield* makeZerospinError('fanout-subscriber-owner-mismatch');
          }
          if (!enabled()) {
            return yield* makeZerospinError('fanout-subscriber-unavailable');
          }
          if (!Number.isSafeInteger(currentIndex) || currentIndex < 0) {
            return yield* makeZerospinError('fanout-subscriber-index-invalid');
          }
          yield* producerLease;
          const { lastIndex } = yield* readPage({
            afterIndex: 0,
            maxIndex: 0,
          });
          if (currentIndex > lastIndex) {
            return yield* makeZerospinError('fanout-subscriber-index-invalid');
          }
          const retained = db
            .select()
            .from(acknowledgement)
            .where(eq(acknowledgement.singletonId, 1))
            .get();
          db.insert(acknowledgement)
            .values({
              singletonId: 1,
              acknowledgedIndex: Math.max(
                retained?.acknowledgedIndex ?? 0,
                currentIndex,
              ),
            })
            .onConflictDoUpdate({
              target: acknowledgement.singletonId,
              set: {
                acknowledgedIndex: Math.max(
                  retained?.acknowledgedIndex ?? 0,
                  currentIndex,
                ),
              },
            })
            .run();
        }).pipe(
          Effect.ensuring(wake().pipe(Effect.exit)),
          Effect.scoped,
          Effect.mapError(error =>
            ensureZerospinError({ code: 'agent-node-fanout-failed', error }),
          ),
          encodeRpcOutcome,
        ),
      );
    }
  }
  return new AgentNodeFanout();
}
