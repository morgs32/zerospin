import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
} from '@zerospin/error';
/*
 * Operation application snapshots `inverseOperation` and `previousUpdatedAt`
 * before writing with the caller-provided `appliedAt`. Both transaction phases
 * share the same validation and inverse-state capture; deferred callers leave
 * reference refusal to their enclosing COMMIT.
 *
 * Projection replay remakes inverse state against local resources. Callers
 * that need rollback retain the returned `IAppliedOperation`.
 */
import { makeDrizzleSchemaFromTable } from '@zerospin/shapes';
import { eq } from 'drizzle-orm';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues, omitBy } from 'es-toolkit';

import { sqliteEffect } from '../drizzle/sqliteEffect.ts';
import type { IDbConfig, ITx } from '../drizzle/types.ts';
import type { IInferAttributesSchema } from '../models/types.ts';

import { getResourceRow } from './getResourceRow.ts';
import { operationCodecs } from './operationCodecs.ts';
import type { IAnyOperation, IAppliedOperation } from './types.ts';

interface IOperationApplicationProps<CONFIG extends IDbConfig> {
  tx: ITx<CONFIG> | SqliteRemoteDatabase;
  operation: IAnyOperation;
  appliedAt: Date;
  physicalTableName?: string | undefined;
}

export const applyOperationTx = Effect.fn('applyOperationTx')(function* <
  CONFIG extends IDbConfig,
>(props: IOperationApplicationProps<CONFIG>) {
  const { operation } = props;
  const { model, operationName, resourceId } = operation;
  const write = <A>(work: () => A | PromiseLike<A>) =>
    sqliteEffect(work).pipe(
      Effect.catchCause(cause => {
        const error = Cause.squash(cause);
        const failure =
          prettyUnknownFailure(error) +
          (error instanceof Error && error.cause !== undefined
            ? `\n${prettyUnknownFailure(error.cause)}`
            : '');
        if (!failure.toLowerCase().includes('foreign key constraint failed')) {
          return Effect.failCause(cause);
        }
        return Effect.fail(
          makeZerospinError({
            code: 'operation-referential-integrity-failed',
            message: `Cannot apply ${operationName} operation to "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: { modelName: model.modelName, resourceId, operationName },
          }),
        );
      }),
    );
  return yield* applyOperationWithWrite(props, write);
});

/** Apply inside a transaction that already enabled SQLite's deferred reference checks. */
export const applyDeferredOperationTx = Effect.fn('applyDeferredOperationTx')(
  function* <CONFIG extends IDbConfig>(
    props: IOperationApplicationProps<CONFIG>,
  ) {
    // Deferred reference refusal belongs to the enclosing transaction's COMMIT.
    return yield* applyOperationWithWrite<CONFIG, never>(props, sqliteEffect);
  },
);

function applyOperationWithWrite<CONFIG extends IDbConfig, WRITE_ERROR>(
  props: IOperationApplicationProps<CONFIG>,
  write: <A>(work: () => A | PromiseLike<A>) => Effect.Effect<A, WRITE_ERROR>,
) {
  const {
    appliedAt,
    operation: submittedOperation,
    tx,
    physicalTableName,
  } = props;
  return Effect.gen(function* () {
    const operation =
      submittedOperation.operationName === 'update'
        ? {
            ...submittedOperation,
            body: {
              ...submittedOperation.body,
              attributes: omitBy(
                submittedOperation.body.attributes,
                value => value === undefined,
              ),
            },
          }
        : submittedOperation;
    const table =
      physicalTableName === undefined
        ? operation.model.drizzleSchema
        : makeDrizzleSchemaFromTable(operation.model.table, undefined, false, {
            name: physicalTableName,
            indexes: [],
          });
    const { model, operationName, resourceId } = operation;
    const codecs = operationCodecs(model);
    if (operation.modelVersion !== model.version) {
      return yield* makeZerospinError({
        code: 'operation-model-version-invalid',
        message: 'Operation must bind its exact model version',
      });
    }
    let inverseOperation: IAppliedOperation['inverseOperation'] = null;
    let previousUpdatedAt: Date | null = null;

    switch (operationName) {
      case 'delete': {
        const resourceRow = yield* getResourceRow({
          tx,
          model,
          operationName,
          resourceId,
          physicalTableName,
        });
        const resource = yield* Schema.decodeUnknownEffect(
          Schema.toType(model.resourceJsonCodec),
        )(resourceRow).pipe(
          mapParseError({
            code: 'delete-resource-row-invalid',
            prefix: `Failed to validate deleted resource "${resourceId}"`,
          }),
        );
        inverseOperation = { resource };
        previousUpdatedAt = resourceRow.updatedAt;

        yield* write(() =>
          tx.delete(table).where(eq(table.id, resourceId)).run(),
        );
        break;
      }
      case 'create': {
        yield* Schema.decodeUnknownEffect(Schema.toType(codecs.create))(
          operation.body,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'invalid-operation-body',
            prefix: 'Invalid create attributes',
          }),
        );
        const encodedAttributes = yield* Schema.encodeUnknownEffect(
          model.attributesSchema as IInferAttributesSchema<typeof model>,
        )(operation.body.attributes).pipe(
          mapParseError({
            code: 'failed-to-encode-create-attributes',
            prefix: `Failed to encode attributes for model "${model.modelName}"`,
          }),
        );
        yield* write(() =>
          tx
            .insert(table)
            .values({
              id: resourceId,
              createdAt: appliedAt,
              updatedAt: appliedAt,
              ...encodedAttributes,
            })
            .run(),
        );
        break;
      }
      case 'update': {
        yield* Schema.decodeUnknownEffect(Schema.toType(codecs.update))(
          operation.body,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'invalid-operation-body',
            prefix: 'Invalid update operation',
          }),
        );
        const resourceRow = yield* getResourceRow({
          tx,
          model,
          operationName,
          resourceId,
          physicalTableName,
        });
        const attributes = omitBy(
          operation.body.attributes,
          value => value === undefined,
        );
        const rawAttributes = mapValues(
          attributes,
          (_value, key) => resourceRow[String(key)],
        );
        const rowAttributes = yield* Schema.decodeUnknownEffect(
          Schema.toType(codecs.rowPatch),
        )(rawAttributes, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'failed-to-decode-row-attributes',
            prefix: `Failed to capture changed attributes for "${model.modelName}"`,
          }),
        );
        inverseOperation = { attributes: rowAttributes };
        previousUpdatedAt = resourceRow.updatedAt;
        const encodedAttributes = yield* Schema.encodeUnknownEffect(
          codecs.rowPatch,
        )(attributes, { onExcessProperty: 'error' }).pipe(
          mapParseError({
            code: 'failed-to-encode-update-attributes',
            prefix: `Failed to encode changed attributes for "${model.modelName}"`,
          }),
        );
        yield* write(() =>
          tx
            .update(table)
            .set({
              updatedAt: appliedAt,
              ...encodedAttributes,
            })
            .where(eq(table.id, resourceId))
            .run(),
        );
        break;
      }
      case 'move': {
        const body = yield* Schema.decodeUnknownEffect(codecs.moveType)(
          operation.body,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'invalid-operation-body',
            prefix: 'Invalid move operation',
          }),
        );
        const resourceRow = yield* getResourceRow({
          tx,
          model,
          operationName,
          resourceId,
          physicalTableName,
        });
        const prior = yield* Schema.decodeUnknownEffect(codecs.moveInverseType)(
          { property: body.property, prevId: resourceRow[body.property] },
        ).pipe(
          mapParseError({
            code: 'move-prior-state-invalid',
            prefix: 'Invalid persisted move property',
          }),
        );
        if (!Object.is(prior.prevId, body.prevId)) {
          return yield* makeZerospinError({
            code: 'operation-move-precondition-failed',
            message: `Move prior value does not match persisted "${model.modelName}.${body.property}"`,
          });
        }
        inverseOperation = prior;
        previousUpdatedAt = resourceRow.updatedAt;

        yield* write(() =>
          tx
            .update(table)
            .set({
              [body.property]: body.nextId,
              updatedAt: appliedAt,
            })
            .where(eq(table.id, resourceId))
            .run(),
        );
        break;
      }
      default: {
        const _exhaustive: never = operationName;
        throw new Error(
          `applyOperationTx operation invariant failed: ${String(_exhaustive)}`,
        );
      }
    }

    return {
      ...operation,
      appliedAt,
      previousUpdatedAt,
      inverseOperation,
    };
  });
}
