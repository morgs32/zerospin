import { makeZerospinError, mapParseError } from '@zerospin/error';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { VersionSchema } from '../declaration/VersionSchema.ts';
import type { IAnyModels, IModel } from '../models/types.ts';

import { operationCodecs } from './operationCodecs.ts';
import type { IEncodedAppliedOperation } from './types.ts';

type IReplayOperation = Pick<
  IEncodedAppliedOperation,
  'modelName' | 'modelVersion' | 'resourceId' | 'operationName' | 'body'
>;

const ReplayOperationSchema = Schema.Struct({
  modelName: Schema.String,
  modelVersion: VersionSchema,
  resourceId: Schema.String,
  operationName: Schema.Literals(['create', 'update', 'delete', 'move']),
  body: Schema.String,
});

/** The receiving owner already guarantees the exact model binding. */
export const prepareBoundReplayAppliedOperation = Effect.fn(
  'prepareBoundReplayAppliedOperation',
)(function* (props: { operation: IReplayOperation; model: IModel }) {
  const { operation, model } = props;
  const codecs = operationCodecs(model).operations;
  return yield* Schema.decodeUnknownEffect(
    Schema.Union([codecs.create, codecs.update, codecs.delete, codecs.move]),
  )(
    {
      modelName: operation.modelName,
      modelVersion: operation.modelVersion,
      resourceId: operation.resourceId,
      operationName: operation.operationName,
      body: operation.body,
    },
    { onExcessProperty: 'error' },
  ).pipe(
    Effect.updateContext<never, never>(() => Context.empty()),
    mapParseError({
      code: 'replay-current-applied-operation-invalid',
      prefix: 'Invalid complete replay operation',
    }),
  );
});

/** Resolve independently supplied replay identity once, then decode its bound body. */
export const prepareReplayAppliedOperation = Effect.fn(
  'prepareReplayAppliedOperation',
)(function* (props: {
  operation: IReplayOperation;
  controller: { models: IAnyModels };
}) {
  const { controller, operation: inputOperation } = props;
  const operation = yield* Schema.decodeUnknownEffect(ReplayOperationSchema)(
    inputOperation,
    { onExcessProperty: 'error' },
  ).pipe(
    mapParseError({
      code: 'replay-operation-envelope-invalid',
      prefix: 'Invalid replay operation envelope',
    }),
  );
  const model = controller.models[operation.modelName];
  if (model === undefined || model.version !== operation.modelVersion) {
    return yield* makeZerospinError({
      code: 'replay-operation-model-version-unavailable',
      message: `Replay requires the exact model ${operation.modelName}@${operation.modelVersion}`,
    });
  }
  return yield* prepareBoundReplayAppliedOperation({
    operation,
    model,
  });
});
