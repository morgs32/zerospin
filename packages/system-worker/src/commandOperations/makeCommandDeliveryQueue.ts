import {
  CommandOutcomeSchema,
  type ICommandOutcome,
} from '@zerospin/core/contracts/CommandOutcomeSchema';
import type { FailedContinuationPayloadSchema } from '@zerospin/core/contracts/ContinuationPayloadSchema';
import type { IRecordedCommand } from '@zerospin/core/contracts/RecordedCommandSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import type { IAnyError, IZerospinErrorJson } from '@zerospin/error';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import type * as ManagedRuntime from 'effect/ManagedRuntime';
import * as References from 'effect/References';
import * as Schema from 'effect/Schema';

import type { IOutboxQueueRuntime } from '../makeOutboxQueue/makeOutboxQueue.js';
import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';

import type { IRecordedCommandOutcome } from './admitRecordedCommand.js';

export type ICommandDelivery = {
  sourceIndex: number;
  operationIndex: number;
  command: IRecordedCommand;
  continuationFailure?: typeof FailedContinuationPayloadSchema.Type;
  destinationOutcome: ICommandOutcome | null;
};

const outcomeJson = Schema.fromJsonString(CommandOutcomeSchema);

/** Schedule each retained command independently and recover uncertain admissions. */
export function makeCommandDeliveryQueue<
  INDEX extends string,
  R,
  INITIALIZATION_ERROR = unknown,
>(
  props: Pick<
    IOutboxQueueRuntime<R, INITIALIZATION_ERROR>,
    'runInvocation' | 'background'
  > & {
    managedRuntime: ManagedRuntime.ManagedRuntime<R, INITIALIZATION_ERROR>;
    db: IDb;
    source: { systemId: string } & (
      | { aggregateId: string; aggregateName: string }
      | { serviceName: string }
    );
    recoveryRegistry: IRecoveryRegistry;
    outboxTable: SQLiteTable &
      Record<INDEX | 'operationIndex', AnySQLiteColumn<{ data: number }>> & {
        destinationOutcome: AnySQLiteColumn<{ data: string | null }>;
      };
    indexColumnName: INDEX;
    readPending(): readonly ICommandDelivery[];
    admit(
      delivery: ICommandDelivery,
    ): Effect.Effect<IRecordedCommandOutcome, IAnyError | IZerospinErrorJson>;
    acknowledge(
      delivery: ICommandDelivery,
      outcome: ICommandOutcome,
    ): Effect.Effect<void, unknown, R>;
  },
) {
  const {
    recoveryRegistry,
    db,
    source,
    outboxTable,
    indexColumnName,
    readPending,
    admit,
    acknowledge,
    managedRuntime,
    runInvocation,
    background,
  } = props;
  const name = 'commandOperationOutbox';
  const destinationOutcome = outboxTable.destinationOutcome;
  const position = (delivery: ICommandDelivery) =>
    and(
      eq(outboxTable[indexColumnName], delivery.sourceIndex),
      eq(outboxTable.operationIndex, delivery.operationIndex),
    );

  /** Persist the first observed execution result before giving it to authored mapping. */
  const settle = Effect.fn('commandOperationOutbox.settle')(function* (
    delivery: ICommandDelivery,
  ) {
    if (delivery.destinationOutcome !== null) {
      return yield* acknowledge(delivery, delivery.destinationOutcome);
    }
    const result = yield* admit(delivery);
    const where = position(delivery);
    const unresolved = and(where, isNull(destinationOutcome));
    if ('admissionFailure' in result) {
      const recorded = delivery.command;
      const destination =
        recorded.type === 'aggregate'
          ? {
              aggregateId: recorded.command.aggregateId,
              aggregateName: recorded.command.aggregateName,
              aggregateVersion: recorded.command.aggregateVersion,
            }
          : {
              serviceName: recorded.command.serviceName,
              serviceVersion: recorded.command.serviceVersion,
            };
      yield* Effect.logError('command-operation-admission-refused').pipe(
        Effect.annotateLogs({
          source,
          sourceIndex: delivery.sourceIndex,
          operationIndex: delivery.operationIndex,
          destination,
          destinationCommandId: recorded.command.id,
          destinationCommandName: recorded.command.commandName,
          destinationContractVersion: recorded.command.contractVersion,
          refusalCode: result.admissionFailure.code,
        }),
      );
      db.delete(outboxTable).where(unresolved).run();
      return;
    }

    const encoded = Schema.encodeSync(outcomeJson)(result.outcome);
    const retained = db.transaction(tx => {
      tx.run(sql`UPDATE ${outboxTable}
        SET ${sql.identifier(destinationOutcome.name)} = ${encoded}
        WHERE ${unresolved}`);
      return tx.get<{ outcome: unknown }>(sql`
        SELECT ${destinationOutcome} AS outcome FROM ${outboxTable} WHERE ${where}
      `);
    });
    if (retained === undefined) return;
    yield* acknowledge(
      delivery,
      Schema.decodeUnknownSync(outcomeJson)(retained.outcome),
    );
  });
  const inFlight = new Set<string>();
  let activeProducers = 0;
  let producerRevision = 0;
  const producerLease = Effect.acquireRelease(
    Effect.gen(function* () {
      activeProducers += 1;
      yield* recoveryRegistry.hold(name).pipe(
        Effect.onExit(exit =>
          Exit.isFailure(exit)
            ? Effect.sync(() => {
                activeProducers -= 1;
                producerRevision += 1;
              })
            : Effect.void,
        ),
      );
    }),
    () =>
      Effect.sync(() => {
        activeProducers -= 1;
        producerRevision += 1;
      }),
  );
  const reconcile = Effect.fn('commandOperationOutbox.reconcile')(function* () {
    const revision = producerRevision;
    const pending = readPending();
    if (pending.length > 0) return yield* recoveryRegistry.hold(name);
    yield* Effect.suspend(() =>
      activeProducers === 0 && revision === producerRevision
        ? recoveryRegistry.release(name)
        : Effect.void,
    ).pipe(Effect.provideService(References.PreventSchedulerYield, true));
  });
  const wake = Effect.fn('commandOperationOutbox.wake')(function* () {
    yield* recoveryRegistry.hold(name);
    const pending = readPending();
    for (const delivery of pending) {
      const id = delivery.command.command.id;
      if (inFlight.has(id)) continue;
      inFlight.add(id);
      const promise = Promise.resolve()
        .then(() =>
          managedRuntime.runPromise(
            runInvocation(settle(delivery).pipe(Effect.ensuring(reconcile()))),
          ),
        )
        .finally(() => {
          inFlight.delete(id);
        });
      const retained = promise.catch(() => undefined);
      try {
        background?.(retained);
      } catch {
        /* recovery remains armed */
      }
    }
    if (pending.length === 0) yield* reconcile();
  });
  recoveryRegistry.register(name, wake());
  return { producerLease, wake };
}
