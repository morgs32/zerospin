import type { IExternalOutcome } from '@zerospin/core/contracts/ExternalOutcomeSchema';
import type { IDb } from '@zerospin/core/drizzle/types';
import { mapParseError } from '@zerospin/error';
import { decodeSync } from '@zerospin/shapes';
import { sql } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as Effect from 'effect/Effect';
import * as References from 'effect/References';
import type * as Schema from 'effect/Schema';

import type { IRecoveryRegistry } from '../makeRecoveryRegistry/makeRecoveryRegistry.js';

import type { IPreparedExternalOperation } from './externalOperation.js';

/** Registers lazy recovery; wake schedules independent requests and their observation settlement. */
export function makeExternalOperationQueue<
  OPERATION extends Pick<
    IPreparedExternalOperation,
    | 'externalCommandId'
    | 'externalContractName'
    | 'externalContractVersion'
    | 'payload'
  > & { readonly externalOutcome: IExternalOutcome | null },
  RECORD_ERROR,
  RECORD_R,
  REQUEST_ERROR,
  REQUEST_R,
>(props: {
  db: IDb;
  outboxTable: SQLiteTable;
  operationCodec: Schema.Codec<OPERATION, unknown>;
  recordExternalOutcomeAndAdmitCommand(
    operation: OPERATION,
    outcome: IExternalOutcome,
  ): Effect.Effect<unknown, RECORD_ERROR, RECORD_R>;
  recoveryRegistry: IRecoveryRegistry;
  request(
    operation: OPERATION,
  ): Effect.Effect<IExternalOutcome, REQUEST_ERROR, REQUEST_R>;
  run<E>(program: Effect.Effect<void, E, unknown>): Promise<void>;
  background(promise: Promise<void>): void;
}) {
  const {
    db,
    outboxTable,
    operationCodec,
    recordExternalOutcomeAndAdmitCommand,
    recoveryRegistry,
    request,
    run,
    background,
  } = props;
  const inFlightCommandIds = new Set<OPERATION['externalCommandId']>();
  const arm = recoveryRegistry.hold('externalOperationQueue');
  const reconcileRecovery = Effect.fn(
    'externalOperationQueue.reconcileRecovery',
  )(() =>
    Effect.suspend(() =>
      db
        .select({ pending: sql`1` })
        .from(outboxTable)
        .limit(1)
        .get() !== undefined
        ? arm
        : recoveryRegistry.release('externalOperationQueue'),
    ).pipe(Effect.provideService(References.PreventSchedulerYield, true)),
  );
  const executeExternalOperation = Effect.fn(
    'externalOperationQueue.executeExternalOperation',
  )((operation: OPERATION) =>
    Effect.uninterruptibleMask(restore =>
      Effect.gen(function* () {
        const observation =
          operation.externalOutcome ?? (yield* restore(request(operation)));
        yield* recordExternalOutcomeAndAdmitCommand(operation, observation);
      }).pipe(Effect.ensuring(reconcileRecovery())),
    ),
  );
  const wake = Effect.fn('externalOperationQueue.wake')(function* () {
    // Reestablish the scheduled wake-up before launching requests on a cold activation.
    yield* reconcileRecovery();
    yield* Effect.gen(function* () {
      for (const row of db.select().from(outboxTable).all()) {
        const operation = yield* decodeSync(operationCodec, row).pipe(
          mapParseError({
            code: 'external-operation-row-invalid',
            prefix: 'Invalid external operation row',
          }),
        );
        const externalCommandId = operation.externalCommandId;
        if (inFlightCommandIds.has(externalCommandId)) continue;
        // Checking, decoding and reservation stay synchronous. Retain the slot
        // until request finalizers, outcome recording and recovery reconciliation settle.
        const promise = Promise.resolve()
          .then(() => run(executeExternalOperation(operation)))
          .finally(() => {
            inFlightCommandIds.delete(externalCommandId);
          });
        inFlightCommandIds.add(externalCommandId);
        background(promise.catch(() => undefined));
      }
    }).pipe(Effect.provideService(References.PreventSchedulerYield, true));
  });
  recoveryRegistry.register('externalOperationQueue', wake());
  return { wake };
}
