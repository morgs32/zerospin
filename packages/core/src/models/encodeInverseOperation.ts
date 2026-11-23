import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { operationCodecs } from '../contracts/operationCodecs.ts';
import type { IAppliedOperation } from '../contracts/types.ts';

import type { IInverseOperation } from './InverseOperationSchema.ts';

/** Retain exact prior state without the forward operation or execution envelope. */
export const encodeInverseOperation = Effect.fn('encodeInverseOperation')(
  function* (props: { operation: IAppliedOperation }) {
    const { operation } = props;
    const { model, operationName, resourceId } = operation;
    if (operation.modelVersion !== model.version) {
      return yield* makeZerospinError('operation-model-version-invalid');
    }
    const codecs = operationCodecs(model);
    yield* Schema.decodeUnknownEffect(Schema.toType(codecs.appliedBodies))(
      {
        resourceId,
        operationName,
        body: operation.body,
        inverseOperation: operation.inverseOperation,
      },
      { onExcessProperty: 'error' },
    ).pipe(
      Effect.updateContext<never, never>(() => Context.empty()),
      mapParseError({
        code: 'invalid-inverse-operation',
        prefix: 'Invalid applied operation inverse',
      }),
    );
    const identity = {
      modelName: model.modelName,
      modelVersion: model.version,
      resourceId,
    };
    if (operationName === 'create') {
      return {
        ...identity,
        operationName,
      } satisfies IInverseOperation;
    }
    if (operation.inverseOperation === null) {
      return yield* makeZerospinError('operation-inverse-required');
    }
    const inverseOperation = yield* (
      operationName === 'update'
        ? Schema.encodeUnknownEffect(codecs.updateInverse)(
            operation.inverseOperation,
            { onExcessProperty: 'error' },
          )
        : operationName === 'delete'
          ? Schema.encodeUnknownEffect(codecs.deleteInverse)(
              operation.inverseOperation,
              { onExcessProperty: 'error' },
            )
          : Schema.encodeUnknownEffect(codecs.moveInverse)(
              operation.inverseOperation,
              { onExcessProperty: 'error' },
            )
    ).pipe(
      Effect.updateContext<never, never>(() => Context.empty()),
      mapParseError({
        code: 'invalid-inverse-operation',
        prefix: `Invalid prior state for "${model.modelName}"`,
      }),
    );
    if (operationName === 'delete') {
      return {
        ...identity,
        operationName,
        inverseOperation,
      } satisfies IInverseOperation;
    }
    if (operation.previousUpdatedAt === null) {
      return yield* makeZerospinError('operation-last-applied-at-required');
    }
    return {
      ...identity,
      operationName,
      inverseOperation,
      previousUpdatedAt: operation.previousUpdatedAt,
    } satisfies IInverseOperation;
  },
);
