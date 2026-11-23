import { mapParseError } from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';

import { operationCodecs, OperationIndexSchema } from './operationCodecs.ts';
import type {
  IAnyOperation,
  IAppliedOperation,
  IEncodedAppliedOperation,
  IEncodedOperation,
} from './types.ts';

export const EncodedOperationSchema = Schema.Struct({
  commandId: Schema.String,
  operationIndex: OperationIndexSchema,
  modelName: Schema.String,
  modelVersion: VersionSchema,
  resourceId: Schema.String,
  operationName: Schema.Literals(['create', 'delete', 'move', 'update']),
  body: Schema.String,
}) satisfies Schema.Codec<IEncodedOperation, unknown>;

export const EncodedAppliedOperationSchema = Schema.Struct({
  ...EncodedOperationSchema.fields,
  appliedAt: Schema.DateFromString,
  previousUpdatedAt: Schema.NullOr(Schema.DateFromString),
  inverseOperation: Schema.String,
}) satisfies Schema.Codec<IEncodedAppliedOperation, unknown>;

/** Encode the complete forward operation through its canonical model leaf. */
export const encodeOperation = Effect.fn('encodeOperation')(function* (props: {
  commandId: string;
  operationIndex: number;
  operation: IAnyOperation;
}) {
  const { operation, commandId, operationIndex } = props;
  const codecs = operationCodecs(operation.model).operations;
  const portable = yield* Schema.encodeUnknownEffect(
    Schema.Union([codecs.create, codecs.update, codecs.delete, codecs.move]),
  )(
    {
      model: operation.model,
      modelVersion: operation.modelVersion,
      operationName: operation.operationName,
      resourceId: operation.resourceId,
      body: operation.body,
    },
    { onExcessProperty: 'error' },
  ).pipe(
    Effect.updateContext<never, never>(() => Context.empty()),
    mapParseError({
      code: 'invalid-operation-body',
      prefix: `Invalid operation for "${operation.model.modelName}"`,
    }),
  );
  return yield* Schema.decodeUnknownEffect(EncodedOperationSchema)({
    commandId,
    operationIndex,
    ...portable,
  }).pipe(
    mapParseError({
      code: 'invalid-operation-envelope',
      prefix: 'Invalid operation envelope',
    }),
  );
});

const encodeInverseOperationBody = Effect.fn('encodeInverseOperationBody')(
  function* (operation: IAppliedOperation) {
    const codecs = operationCodecs(operation.model);
    const inverse = operation.inverseOperation;
    switch (operation.operationName) {
      case 'create':
        return yield* Schema.encodeUnknownEffect(codecs.createInverse)(
          inverse,
          { onExcessProperty: 'error' },
        );
      case 'update':
        return yield* Schema.encodeUnknownEffect(codecs.updateInverse)(
          inverse,
          { onExcessProperty: 'error' },
        );
      case 'delete':
        return yield* Schema.encodeUnknownEffect(codecs.deleteInverse)(
          inverse,
          { onExcessProperty: 'error' },
        );
      case 'move':
        return yield* Schema.encodeUnknownEffect(codecs.moveInverse)(inverse, {
          onExcessProperty: 'error',
        });
      default:
        throw new Error(
          'Operation name must select a supported operation codec',
        );
    }
  },
);

/** Encode forward and inverse once after proving their operation-specific pairing. */
export const encodeAppliedOperation = Effect.fn('encodeAppliedOperation')(
  function* (props: {
    operation: IAppliedOperation;
    commandId: string;
    operationIndex: number;
  }) {
    const { operation } = props;
    yield* Schema.decodeUnknownEffect(
      Schema.toType(operationCodecs(operation.model).appliedBodies),
    )(
      {
        resourceId: operation.resourceId,
        operationName: operation.operationName,
        body: operation.body,
        inverseOperation: operation.inverseOperation,
      },
      { onExcessProperty: 'error' },
    ).pipe(
      Effect.updateContext<never, never>(() => Context.empty()),
      mapParseError({
        code: 'invalid-inverse-operation',
        prefix: 'Invalid applied operation body/inverse pairing',
      }),
    );
    const forward = yield* encodeOperation({
      commandId: props.commandId,
      operationIndex: props.operationIndex,
      operation,
    });
    const inverseOperation = yield* encodeInverseOperationBody(operation).pipe(
      Effect.updateContext<never, never>(() => Context.empty()),
      mapParseError({
        code: 'invalid-inverse-operation',
        prefix: 'Invalid applied operation inverse',
      }),
    );
    return yield* Schema.decodeUnknownEffect(
      Schema.toType(EncodedAppliedOperationSchema),
    )({
      ...forward,
      appliedAt: operation.appliedAt,
      previousUpdatedAt: operation.previousUpdatedAt,
      inverseOperation,
    }).pipe(
      mapParseError({
        code: 'invalid-applied-operation-envelope',
        prefix: 'Invalid applied operation envelope',
      }),
    );
  },
);
