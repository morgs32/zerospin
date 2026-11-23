import {
  makeZerospinError,
  mapParseError,
  prettyUnknownFailure,
  type IAnyError,
} from '@zerospin/error';
import { eq } from 'drizzle-orm';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { operationCodecs } from '../contracts/operationCodecs.ts';
import type { ITx } from '../drizzle/types.ts';
import { upsertHelper } from '../drizzle/upsertHelper.ts';

import {
  InverseOperationSchema,
  type IInverseOperation,
} from './InverseOperationSchema.ts';
import { makeIdSchema } from './make/makeIdSchema.ts';
import type { IModel } from './types.ts';

/** Restore one current inverse against its exact registered model. */
export const applyInverseOperationTx = Effect.fn('applyInverseOperationTx')(
  function* (props: {
    tx: ITx;
    operation: IInverseOperation;
    model: IModel;
  }): Effect.fn.Return<void, IAnyError> {
    const { tx, model, operation: inputOperation } = props;
    const operation = yield* Schema.decodeUnknownEffect(
      Schema.toType(InverseOperationSchema),
    )(inputOperation, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'invalid-inverse-operation',
        prefix: 'Invalid inverse operation',
      }),
    );
    if (
      operation.modelName !== model.modelName ||
      operation.modelVersion !== model.version
    ) {
      return yield* makeZerospinError({
        code: 'unknown-applied-operation-model-version',
        message: `Inverse operation requires ${operation.modelName}@${operation.modelVersion}`,
      });
    }
    const resourceId = yield* Schema.decodeUnknownEffect(makeIdSchema(model))(
      operation.resourceId,
    ).pipe(
      mapParseError({
        code: 'invalid-inverse-operation',
        prefix: 'Invalid inverse resource identity',
      }),
    );
    const table = model.drizzleSchema;
    const codecs = operationCodecs(model);
    const write = (work: () => unknown) =>
      Effect.try({
        try: work,
        catch: cause => {
          const failure = `${prettyUnknownFailure(cause)}${
            cause instanceof Error && cause.cause !== undefined
              ? `\n${prettyUnknownFailure(cause.cause)}`
              : ''
          }`;
          if (
            !failure.toLowerCase().includes('foreign key constraint failed')
          ) {
            throw cause;
          }
          return makeZerospinError({
            code: 'operation-referential-integrity-failed',
            message: `Cannot undo ${operation.operationName} on "${model.modelName}.${resourceId}" because it violates a persisted reference`,
            cause: failure,
            extra: {
              modelName: model.modelName,
              resourceId,
              operationName: operation.operationName,
            },
          });
        },
      });
    switch (operation.operationName) {
      case 'create':
        yield* write(() =>
          tx.delete(table).where(eq(table.id, resourceId)).run(),
        );
        return;
      case 'update': {
        const inverse = yield* Schema.decodeUnknownEffect(codecs.updateInverse)(
          operation.inverseOperation,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'invalid-inverse-operation',
            prefix: 'Invalid inverse update attributes',
          }),
        );
        if (inverse === null) {
          return yield* makeZerospinError('operation-inverse-required');
        }
        const attributes = yield* Schema.encodeUnknownEffect(codecs.rowPatch)(
          inverse.attributes,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'failed-to-encode-inverse-update-attributes',
            prefix: `Invalid inverse update attributes for "${model.modelName}"`,
          }),
        );
        yield* write(() =>
          tx
            .update(table)
            .set({ ...attributes, updatedAt: operation.previousUpdatedAt })
            .where(eq(table.id, resourceId))
            .run(),
        );
        return;
      }
      case 'delete': {
        const inverse = yield* Schema.decodeUnknownEffect(codecs.deleteInverse)(
          operation.inverseOperation,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'invalid-inverse-operation',
            prefix: 'Invalid deleted resource inverse',
          }),
        );
        if (inverse === null) {
          return yield* makeZerospinError('operation-inverse-required');
        }
        const resource = inverse.resource;
        if (
          resource.id !== resourceId ||
          resource.modelName !== model.modelName ||
          resource.version !== model.version
        ) {
          return yield* makeZerospinError('invalid-inverse-operation');
        }
        const values = yield* model.table.encodeRow(resource).pipe(
          mapParseError({
            code: 'failed-to-encode-inverse-resource',
            prefix: `Invalid deleted resource for "${model.modelName}"`,
          }),
        );
        yield* write(() =>
          upsertHelper({
            tx,
            table,
            values: {
              ...values,
              id: resource.id,
              createdAt: resource.createdAt,
              updatedAt: resource.updatedAt,
            },
          }),
        );
        return;
      }
      case 'move': {
        const inverse = yield* Schema.decodeUnknownEffect(codecs.moveInverse)(
          operation.inverseOperation,
          { onExcessProperty: 'error' },
        ).pipe(
          mapParseError({
            code: 'invalid-inverse-operation',
            prefix: 'Invalid inverse move property',
          }),
        );
        if (inverse === null) {
          return yield* makeZerospinError('operation-inverse-required');
        }
        yield* write(() =>
          tx
            .update(table)
            .set({
              [inverse.property]: inverse.prevId,
              updatedAt: operation.previousUpdatedAt,
            })
            .where(eq(table.id, resourceId))
            .run(),
        );
        return;
      }
    }
  },
);
