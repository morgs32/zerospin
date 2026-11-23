import { mapParseError } from '@zerospin/error';
import type {
  IInferDecodedRow,
  IInferIdFromAbbreviation,
  IPrimitiveDescriptorDecoded,
} from '@zerospin/shapes';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import type { IModel, IModelOperations } from '../models/types.ts';

import type { IMoveProperty } from './moveOperation.ts';
import { operationCodecs } from './operationCodecs.ts';
import type { IAnyOperation } from './types.ts';

export type ICreateModelOperationProps<MODEL extends IModel> = Readonly<{
  resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  attributes: IInferDecodedRow<MODEL['attributes']>;
}>;
export type IUpdateModelOperationProps<MODEL extends IModel> = Readonly<{
  resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  attributes: Partial<IInferDecodedRow<MODEL['attributes']>>;
  mask?: ReadonlyArray<keyof IInferDecodedRow<MODEL['attributes']> & string>;
}>;
export type IDeleteModelOperationProps<MODEL extends IModel> = Readonly<{
  resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
}>;
/** The discriminated union keeps each property coupled to its own value type. */
export type IMoveModelOperationProps<MODEL extends IModel> = {
  [PROPERTY in IMoveProperty<MODEL>]: Readonly<{
    resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
    property: PROPERTY;
    prevId: IPrimitiveDescriptorDecoded<MODEL['attributes'][PROPERTY]>;
    nextId: IPrimitiveDescriptorDecoded<MODEL['attributes'][PROPERTY]>;
  }>;
}[IMoveProperty<MODEL>];

const definitionsByModel = new WeakMap<IModel, IModelOperations<IModel>>();

/** Bind model identity once; makers validate and snapshot only when their Effect runs. */
export function modelOperationDefinitions<MODEL extends IModel>(
  model: MODEL,
): IModelOperations<MODEL>;
export function modelOperationDefinitions(model: IModel): unknown {
  const cached = definitionsByModel.get(model);
  if (cached !== undefined) return cached;
  const schemas = operationCodecs(model).operations;
  const definitions = {
    create: bindModelOperation(
      model,
      'create',
      schemas.create,
      (props: ICreateModelOperationProps<IModel>) => {
        const { attributes } = props;
        return { attributes };
      },
      'create-resource-missing-attributes',
      'Invalid create operation',
    ),
    update: bindModelOperation(
      model,
      'update',
      schemas.update,
      (props: IUpdateModelOperationProps<IModel>) => {
        const { attributes: inputAttributes, mask } = props;
        const attributes: Partial<IInferDecodedRow<IModel['attributes']>> = {};
        mapValues(inputAttributes, (value, key) => {
          if (
            value !== undefined &&
            (mask === undefined || mask.includes(String(key)))
          ) {
            attributes[String(key)] = value;
          }
        });
        return { attributes };
      },
      'contract-program-operation-invalid',
      'Invalid update operation',
    ),
    delete: bindModelOperation(
      model,
      'delete',
      schemas.delete,
      (_props: IDeleteModelOperationProps<IModel>) => ({}),
      'contract-program-operation-invalid',
      'Invalid delete operation',
    ),
    move: bindModelOperation(
      model,
      'move',
      schemas.move,
      (props: IMoveModelOperationProps<IModel>) => {
        const { property, prevId, nextId } = props;
        return { property, prevId, nextId };
      },
      'contract-program-operation-invalid',
      'Invalid move operation',
    ),
  };
  definitionsByModel.set(model, definitions);
  return definitions;
}

/** Each model verb shares exact identity, lazy validation and owned body snapshots. */
function bindModelOperation<
  PROPS extends { readonly resourceId: string },
  OPERATION extends IAnyOperation,
  ENCODED,
  CODE extends string,
>(
  model: IModel,
  operationName: OPERATION['operationName'],
  schema: Schema.Codec<OPERATION, ENCODED>,
  makeBody: (props: PROPS) => object,
  code: CODE,
  prefix: string,
) {
  return {
    model,
    operationName,
    schema,
    make: (props: PROPS) =>
      Effect.suspend(() => {
        // Operation inputs are intentionally read when this Effect runs.
        const { resourceId } = props;
        return Schema.decodeUnknownEffect(Schema.toType(schema))(
          {
            model,
            modelVersion: model.version,
            operationName,
            resourceId,
            body: makeBody(props),
          },
          { onExcessProperty: 'error' },
        ).pipe(
          Effect.updateContext<never, never>(() => Context.empty()),
          mapParseError({ code, prefix }),
        );
      }),
  };
}
