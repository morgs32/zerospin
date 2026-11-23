import {
  compileDescriptor,
  makeShapeCodecs,
  PrimitiveKind,
  SafeIntegerSchema,
} from '@zerospin/shapes';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import * as SchemaParser from 'effect/SchemaParser';
import * as SchemaTransformation from 'effect/SchemaTransformation';
import { mapValues } from 'es-toolkit';

import { makeIdSchema } from '../models/make/makeIdSchema.ts';
import { isModel } from '../models/make/makeModelVersion.ts';
import type { IModel, IPortableModelOperation } from '../models/types.ts';

import type { ICreateOperation } from './createOperation.ts';
import type { IDeleteOperation } from './deleteOperation.ts';
import type { IMoveOperation } from './moveOperation.ts';
import type { IUpdateOperation } from './updateOperation.ts';

export type IModelOperationSchemas<MODEL extends IModel> = Readonly<{
  create: Schema.Codec<
    ICreateOperation<MODEL>,
    IPortableModelOperation<MODEL, 'create'>
  >;
  update: Schema.Codec<
    IUpdateOperation<MODEL>,
    IPortableModelOperation<MODEL, 'update'>
  >;
  delete: Schema.Codec<
    IDeleteOperation<MODEL>,
    IPortableModelOperation<MODEL, 'delete'>
  >;
  move: Schema.Codec<
    IMoveOperation<MODEL>,
    IPortableModelOperation<MODEL, 'move'>
  >;
}>;

export const OperationIndexSchema = SafeIntegerSchema.check(
  Schema.isGreaterThanOrEqualTo(0),
);
const MoveValueSchema = Schema.NullOr(
  Schema.Union([Schema.String, SafeIntegerSchema]),
);
const codecsByModel = new WeakMap<
  IModel,
  ReturnType<typeof makeOperationCodecs>
>();

function makeOperationCodecs(model: IModel) {
  const attributes = makeShapeCodecs(model.attributes);
  const resource = makeShapeCodecs(model.propertiesShape);
  const rowPatch = Schema.Struct(
    mapValues(model.attributes, descriptor =>
      Schema.optionalKey(compileDescriptor(descriptor).rowCodec),
    ),
  );
  const create = Schema.fromJsonString(
    Schema.Struct({ attributes: attributes.portableCompleteCodec }),
  );
  const update = Schema.fromJsonString(
    Schema.Struct({ attributes: attributes.portablePatchCodec }),
  );
  const remove = Schema.fromJsonString(
    Schema.Struct({}).check(
      Schema.makeFilter(
        body =>
          Object.keys(body).length === 0 ||
          'Delete operation body must be empty',
      ),
    ),
  );
  const moveType = Schema.Struct({
    property: Schema.String,
    prevId: MoveValueSchema,
    nextId: MoveValueSchema,
  }).check(Schema.makeFilter(body => validateMoveValues(model, body)));
  const moveInverseType = Schema.Struct({
    property: Schema.String,
    prevId: MoveValueSchema,
  }).check(Schema.makeFilter(body => validateMoveValues(model, body)));
  const move = Schema.fromJsonString(moveType);
  const createInverse = Schema.fromJsonString(Schema.Null);
  const updateInverse = Schema.fromJsonString(
    Schema.NullOr(Schema.Struct({ attributes: attributes.portablePatchCodec })),
  );
  const deleteInverse = Schema.fromJsonString(
    Schema.NullOr(Schema.Struct({ resource: model.resourceJsonCodec })),
  );
  const moveInverse = Schema.fromJsonString(Schema.NullOr(moveInverseType));
  const resourceId = makeIdSchema(model);
  const appliedBodies = Schema.Union([
    Schema.Struct({
      resourceId,
      operationName: Schema.Literal('create'),
      body: create,
      inverseOperation: createInverse,
    }),
    Schema.Struct({
      resourceId,
      operationName: Schema.Literal('update'),
      body: update,
      inverseOperation: updateInverse,
    }).check(
      Schema.makeFilter(
        value =>
          value.inverseOperation === null ||
          sameKeys(value.body.attributes, value.inverseOperation.attributes) ||
          'Update inverse must contain precisely the changed attributes',
      ),
    ),
    Schema.Struct({
      resourceId,
      operationName: Schema.Literal('delete'),
      body: remove,
      inverseOperation: deleteInverse,
    }).check(
      Schema.makeFilter(
        value =>
          value.inverseOperation === null ||
          (value.inverseOperation.resource.id === value.resourceId &&
            value.inverseOperation.resource.modelName === model.modelName &&
            value.inverseOperation.resource.version === model.version) ||
          'Delete inverse must restore the exact model resource',
      ),
    ),
    Schema.Struct({
      resourceId,
      operationName: Schema.Literal('move'),
      body: move,
      inverseOperation: moveInverse,
    }).check(
      Schema.makeFilter(
        value =>
          value.inverseOperation === null ||
          value.inverseOperation.property === value.body.property ||
          'Move inverse must restore the moved property',
      ),
    ),
  ]);
  const operations = {
    create: makeCompleteOperationCodec(model, 'create', create),
    update: makeCompleteOperationCodec(model, 'update', update),
    delete: makeCompleteOperationCodec(model, 'delete', remove),
    move: makeCompleteOperationCodec(model, 'move', move),
  };
  return {
    operations,
    attributes,
    resource,
    rowPatch,
    create,
    update,
    delete: remove,
    move,
    moveType,
    moveInverseType,
    createInverse,
    updateInverse,
    deleteInverse,
    moveInverse,
    appliedBodies,
  };
}

function makeCompleteOperationCodec(
  model: IModel,
  operationName: 'create' | 'update' | 'delete' | 'move',
  body: Schema.Codec<object, string>,
) {
  const domain = Schema.Struct({
    model: Schema.declare((value): value is IModel => value === model),
    modelVersion: Schema.Literal(model.version),
    operationName: Schema.Literal(operationName),
    resourceId: makeIdSchema(model),
    body: Schema.toType(body),
  });
  const ownedDomain = Schema.declareConstructor<typeof domain.Type>()(
    [domain],
    ([codec]) =>
      (value, _ast, options) =>
        SchemaParser.decodeUnknownEffect(codec)(value, options).pipe(
          Effect.map(operation =>
            Object.freeze({
              ...operation,
              body: structuredClone(operation.body),
            }),
          ),
        ),
  );
  const portable = Schema.Struct({
    modelName: Schema.Literal(model.modelName),
    modelVersion: Schema.Literal(model.version),
    operationName: Schema.Literal(operationName),
    resourceId: makeIdSchema(model),
    body,
  });
  const codec = portable.pipe(
    Schema.decodeTo(
      ownedDomain,
      SchemaTransformation.transform({
        decode: operation => ({
          model,
          modelVersion: operation.modelVersion,
          operationName: operation.operationName,
          resourceId: operation.resourceId,
          body: operation.body,
        }),
        encode: operation => ({
          modelName: model.modelName,
          modelVersion: operation.modelVersion,
          operationName: operation.operationName,
          resourceId: operation.resourceId,
          body: operation.body,
        }),
      }),
    ),
  );
  return codec;
}

function sameKeys(left: object, right: object): boolean {
  return (
    JSON.stringify(Object.keys(left).sort()) ===
    JSON.stringify(Object.keys(right).sort())
  );
}

function validateMoveValues(
  model: IModel,
  body: {
    property: string;
    prevId: string | number | null;
    nextId?: string | number | null;
  },
): true | string {
  const descriptor = model.attributes[body.property];
  if (
    descriptor === undefined ||
    (descriptor.kind !== PrimitiveKind.Cursor &&
      descriptor.references === undefined)
  ) {
    return `Move property "${body.property}" must be an authored cursor or reference attribute`;
  }
  const valueSchema = compileDescriptor(descriptor).decodedSchema;
  if (
    !Schema.is(valueSchema)(body.prevId) ||
    ('nextId' in body && !Schema.is(valueSchema)(body.nextId))
  ) {
    return `Move values must satisfy "${model.modelName}.${body.property}"`;
  }
  return true;
}

/** Retain one codec set for each exact completed immutable model version. */
export function operationCodecs<MODEL extends IModel>(
  model: MODEL,
): Omit<ReturnType<typeof makeOperationCodecs>, 'operations'> & {
  readonly operations: IModelOperationSchemas<MODEL>;
};
export function operationCodecs(model: IModel): unknown {
  if (!isModel(model)) {
    throw new Error('Operation codecs require a completed Model version');
  }
  let codecs = codecsByModel.get(model);
  if (codecs === undefined) {
    codecs = makeOperationCodecs(model);
    codecsByModel.set(model, codecs);
  }
  return codecs;
}
