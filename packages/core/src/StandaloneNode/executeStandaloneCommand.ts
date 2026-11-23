import { makeZerospinError } from '@zerospin/error';
import { makeFn } from '@zerospin/logger';
import { eq, sql } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Schema from 'effect/Schema';

import type {
  AggregateNode,
  IAggregateNodeSnapshot,
} from '../AggregateNode/AggregateNode.ts';
import { hasAggregateNodeCheckpoint } from '../AggregateNode/hasAggregateNodeCheckpoint.ts';
import type { IAggregateNodeCommand } from '../AggregateNode/types.ts';
import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import { applyOperationTx } from '../contracts/applyOperationTx.ts';
import { decodeAndAdaptPayload } from '../contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts';
import {
  encodeDispositionTuple,
  hashDispositionChain,
} from '../contracts/dispositionChainHash.ts';
import { encodeBusinessFailure } from '../contracts/failureCodec.ts';
import {
  evaluatePreparedContract,
  isOrdinaryContract,
} from '../contracts/make/constructContractRelease.ts';
import type { makeAsyncContractReadDb } from '../contracts/make/makeContractReadDb.ts';
import { prepareAggregateInvocation } from '../contracts/prepare/prepareAggregateInvocation.ts';
import { encodeContractResult } from '../contracts/resultCodec.ts';
import { ActorDeltaSchema } from '../models/ActorDeltaSchema.ts';
import type { IEncodedResourceShape } from '../models/types.ts';
import { makeResourceFromEncodedRow } from '../Node/resourceEnvelope.ts';

/** A scoped refusal is command outcome data; other single typed failures stay in the execution channel. */
function isNonBusinessCause<E>(cause: Cause.Cause<E>): boolean {
  return cause.reasons.every(
    reason =>
      !Cause.isFailReason(reason) ||
      typeof reason.error !== 'object' ||
      reason.error === null ||
      !('scope' in reason.error),
  );
}

/** Execute under the Node's existing transaction; retain only codec-declared business failures as data. */
export const executeStandaloneCommand = makeFn(
  'StandaloneNode.executeStandaloneCommand',
)(function* (props: {
  sessionDefinition: IAggregateSessionDefinition;
  db: SqliteRemoteDatabase;
  readDb: ReturnType<typeof makeAsyncContractReadDb>;
  aggregateId: string;
  command: Extract<IAggregateNodeCommand, { nodeId: string }>;
  checkpoint: IAggregateNodeSnapshot['metadata'];
}) {
  const { sessionDefinition, db, readDb, aggregateId, command, checkpoint } =
    props;
  if (command.aggregateId !== aggregateId) {
    return yield* makeZerospinError('aggregate-command-scope-mismatch');
  }
  if (!hasAggregateNodeCheckpoint(checkpoint)) {
    return yield* makeZerospinError('node-execution-checkpoint-invalid');
  }
  const contract = sessionDefinition.contracts[command.commandName];
  if (
    contract === undefined ||
    contract.version !== command.contractVersion ||
    !isOrdinaryContract(contract)
  ) {
    return yield* makeZerospinError('standalone-contract-invalid');
  }
  const originalClaims = Schema.decodeUnknownSync(
    sessionDefinition.claimsSchema,
  )(command.claims);
  const startedAt = new Date();
  yield* Effect.promise(() => db.run(sql`SAVEPOINT standalone_command`));
  const execution = Effect.gen(function* () {
    const payload = yield* decodeAndAdaptPayload(contract, { command });
    const prepared = yield* prepareAggregateInvocation({
      contract,
      command: { ...command, payload },
      claims: originalClaims,
    });
    const made = yield* evaluatePreparedContract(prepared, readDb);
    const encodedResult = yield* encodeContractResult(contract, made.result);
    const affected = new Map<string, { modelName: string; id: string }>();
    for (const operation of made.operations) {
      if (
        operation.operationName === 'external' ||
        operation.operationName === 'command'
      ) {
        return yield* Effect.die(
          new Error('Unexpected emitted async operation'),
        );
      }
      yield* applyOperationTx({
        tx: db,
        operation,
        appliedAt: startedAt,
      });
      affected.set(`${operation.model.modelName}:${operation.resourceId}`, {
        modelName: operation.model.modelName,
        id: operation.resourceId,
      });
    }
    const upserted: IEncodedResourceShape[] = [];
    const deleted: { modelName: string; id: string }[] = [];
    for (const ref of affected.values()) {
      const model = sessionDefinition.models[ref.modelName];
      if (model === undefined) {
        return yield* Effect.die(new Error('Missing emitted model'));
      }
      const [resource] = yield* Effect.promise(() =>
        db
          .select()
          .from(model.drizzleSchema)
          .where(eq(model.drizzleSchema.id, ref.id)),
      );
      if (resource === undefined) {
        deleted.push(ref);
      } else {
        upserted.push(makeResourceFromEncodedRow(resource, model));
      }
    }
    return {
      result: encodedResult,
      delta: Schema.decodeUnknownSync(Schema.toType(ActorDeltaSchema))({
        upserted,
        deleted,
      }),
    };
  }).pipe(Effect.scoped);
  const exit = yield* Effect.exit(execution);
  let failure: Effect.Success<ReturnType<typeof encodeBusinessFailure>> | null =
    null;
  if (Exit.isFailure(exit)) {
    yield* Effect.promise(() => db.run(sql`ROLLBACK TO standalone_command`));
    if (isNonBusinessCause(exit.cause)) {
      return yield* Effect.failCause(exit.cause);
    }
    const reason = exit.cause.reasons[0];
    if (
      exit.cause.reasons.length !== 1 ||
      reason === undefined ||
      !Cause.isFailReason(reason)
    ) {
      return yield* Effect.die(exit.cause);
    }
    failure = yield* encodeBusinessFailure(contract, reason.error);
  }
  yield* Effect.promise(() => db.run(sql`RELEASE standalone_command`));
  const finalizedAt = new Date();
  const outcome = {
    result: Exit.isSuccess(exit)
      ? { _tag: 'Success' as const, success: exit.value.result }
      : failure === null
        ? yield* Effect.die(new Error('Missing standalone command outcome'))
        : { _tag: 'Failure' as const, failure },
    finalizedAt,
  };
  const aggregateIndex = checkpoint.aggregateIndex + 1;
  return {
    id: command.id,
    commandName: command.commandName,
    aggregateIndex,
    dispositionChainHash: yield* Effect.promise(() =>
      hashDispositionChain(
        encodeDispositionTuple({
          previousHash: checkpoint.dispositionChainHash,
          index: aggregateIndex,
          commandId: command.id,
          outcome,
        }),
      ),
    ),
    delta: Exit.isSuccess(exit)
      ? exit.value.delta
      : { upserted: [], deleted: [] },
    failure,
  } satisfies Parameters<AggregateNode['receiveCommand']>[0];
});
