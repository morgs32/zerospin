/* oxlint-disable typescript/no-explicit-any -- Effect Schema encoded type / generic defaults */
import type { IZerospinError } from '@zerospin/error';
import type {
  IDrizzleIndexConfig,
  IDrizzleSchema,
  IEncodedShape,
  IInferDecodedRow,
  IInferEncodedRow,
  IInferIdFromAbbreviation,
  IHasDefault,
  IPrimitive,
  IPrimitiveDescriptor,
  IPrimitiveDescriptorDecoded,
  IPrimitiveDescriptorEncoded,
  IShape,
  ITable,
  ITypeError,
  PrimitiveKind,
} from '@zerospin/shapes';
import type { Schema } from 'effect';
import type { Brand } from 'effect/Brand';

import type { ICreateOperation } from '../contracts/createOperation.ts';
import type { IDeleteOperation } from '../contracts/deleteOperation.ts';
import type {
  ICreateModelOperationProps,
  IDeleteModelOperationProps,
  IMoveModelOperationProps,
  IUpdateModelOperationProps,
} from '../contracts/modelOperationDefinitions.ts';
import type { IMoveOperation } from '../contracts/moveOperation.ts';
import type {
  IModelOperationBinding,
  IOperationDefinition,
} from '../contracts/operationDefinition.ts';
import type { IUpdateOperation } from '../contracts/updateOperation.ts';

export type IPortableModelOperation<
  MODEL extends IModel = IModel,
  NAME extends 'create' | 'update' | 'delete' | 'move' =
    | 'create'
    | 'update'
    | 'delete'
    | 'move',
> = Readonly<{
  modelName: MODEL['modelName'];
  modelVersion: MODEL['version'];
  operationName: NAME;
  resourceId: IInferIdFromAbbreviation<MODEL['abbreviation']>;
  body: string;
}>;
export type IModelOperations<MODEL extends IModel> = Readonly<{
  create: IOperationDefinition<
    ICreateModelOperationProps<MODEL>,
    ICreateOperation<MODEL>,
    IPortableModelOperation<MODEL, 'create'>,
    IZerospinError<'create-resource-missing-attributes'>
  > &
    IModelOperationBinding<MODEL, 'create'>;
  update: IOperationDefinition<
    IUpdateModelOperationProps<MODEL>,
    IUpdateOperation<MODEL>,
    IPortableModelOperation<MODEL, 'update'>,
    IZerospinError<'contract-program-operation-invalid'>
  > &
    IModelOperationBinding<MODEL, 'update'>;
  delete: IOperationDefinition<
    IDeleteModelOperationProps<MODEL>,
    IDeleteOperation<MODEL>,
    IPortableModelOperation<MODEL, 'delete'>,
    IZerospinError<'contract-program-operation-invalid'>
  > &
    IModelOperationBinding<MODEL, 'delete'>;
  move: IOperationDefinition<
    IMoveModelOperationProps<MODEL>,
    IMoveOperation<MODEL>,
    IPortableModelOperation<MODEL, 'move'>,
    IZerospinError<'contract-program-operation-invalid'>
  > &
    IModelOperationBinding<MODEL, 'move'>;
}>;

// --- model ---

export type IProperties = IResourceShape & IShape;

export type IEncodedProperties = IInferEncodedRow<IProperties>;
export type IDecodedProperties = IInferDecodedRow<IProperties>;

/**
 * Caller payload **input** for contracts: IDs must be supplied. Scalar fields
 * and nullable JSON fields with `defaultValue` may be omitted.
 * `validatePayload` fills defaults via
 * `descriptorToEffectSchema`.
 * Other fields match {@link IInferDecodedRow}.
 */
type IDefaultedPayloadKeys<SHAPE extends IShape> = {
  [KEY in keyof SHAPE]: IHasDefault<SHAPE[KEY]> extends true ? KEY : never;
}[keyof SHAPE];

export type IInferPayloadInput<SHAPE extends IShape> = IPrettify<
  {
    [KEY in Exclude<
      keyof SHAPE,
      IDefaultedPayloadKeys<SHAPE>
    >]: IPrimitiveDescriptorDecoded<SHAPE[KEY]>;
  } & {
    [KEY in IDefaultedPayloadKeys<SHAPE>]?: IPrimitiveDescriptorDecoded<
      SHAPE[KEY]
    >;
  }
>;

/** Command / contract program payload after defaults are filled. */
export type IInferCommandPayload<SHAPE extends IShape> = {
  [K in keyof SHAPE]: IPrimitiveDescriptorDecoded<SHAPE[K]>;
};

export type IPrettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type IResourceShape = {
  id: {
    kind: PrimitiveKind.Id;
    abbreviation: string;
    primaryKey: true;
    nullable: false;
  };
  modelName: { kind: PrimitiveKind.Text; nullable: false };
  createdAt: { kind: PrimitiveKind.Date; nullable: false };
  updatedAt: { kind: PrimitiveKind.Date; nullable: false };
  version: { kind: PrimitiveKind.Integer; nullable: false };
};

/**
 * Complete resource descriptors: caller-declared {@link ATTRIBUTES} plus standard framework
 * properties (abbreviation-scoped primary key replaces generic {@link IResourceShape} `id`).
 */
export type IInferProperties<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string = string,
> = ATTRIBUTES &
  Omit<IResourceShape, 'id'> & {
    id: IResourceShape['id'] & { abbreviation: ABBREVIATION };
  };

export type IDecodedResource = IInferDecodedRow<IResourceShape>;

export type IEncodedResourceShape = IInferEncodedRow<IResourceShape> &
  Record<string, unknown>;

export type IEncodedResource = Readonly<IEncodedResourceShape> &
  Brand<'EncodedResource'>;

export type IDrizzleResourceTable = IDrizzleSchema<
  string,
  Omit<IResourceShape, 'modelName' | 'version'>
>;

/** Keys merged by {@link makeVersion}; not part of payload / {@link IModel.attributesSchema}. */
export type IModelReservedAttributeKeys =
  | 'createdAt'
  | 'id'
  | 'modelName'
  | 'updatedAt'
  | 'version';

/** Strips framework columns from a full {@link IInferProperties} shape → declared attributes shape. */
export type IInferModelAttributesShape<PROPERTIES extends IShape> = Omit<
  PROPERTIES,
  IModelReservedAttributeKeys
>;

/** Serializable model definition and JSON Schemas for SystemSpec compilation. */
export type IModelSpec = {
  readonly modelName: string;
  readonly abbreviation: string;
  readonly version: number;
  readonly attributes: readonly string[];
  readonly attributesShape: Readonly<IEncodedShape>;
  readonly propertiesShape: Readonly<IEncodedShape>;
  readonly indexes: readonly Readonly<IDrizzleIndexConfig<string>>[];
};

/**
 * `attributes` is the authored operation shape. `propertiesShape` describes complete
 * resources; the table omits the identity already held by this Model.
 */
export interface IModel<
  ATTRIBUTES extends IShape = any,
  ABBREVIATION extends string = string,
  MODEL_NAME extends string = string,
  VERSION extends number = number,
  PROPERTIES_SHAPE extends IShape = IInferProperties<ATTRIBUTES, ABBREVIATION>,
> {
  readonly abbreviation: ABBREVIATION;
  readonly attributes: ATTRIBUTES;
  readonly indexes: readonly Readonly<
    IDrizzleIndexConfig<
      Exclude<keyof PROPERTIES_SHAPE, 'modelName' | 'version'> & string
    >
  >[];

  readonly modelName: MODEL_NAME;
  readonly version: VERSION;
  readonly propertiesShape: PROPERTIES_SHAPE;
  readonly table: ITable<
    MODEL_NAME,
    Omit<PROPERTIES_SHAPE, 'modelName' | 'version'>
  >;
  readonly drizzleSchema: IDrizzleResourceTable;
  readonly attributesSchema: Schema.Codec<
    IInferDecodedRow<ATTRIBUTES>,
    IInferEncodedRow<ATTRIBUTES>
  > &
    Schema.Struct<{
      [K in keyof ATTRIBUTES]: Schema.Codec<
        IPrimitiveDescriptorDecoded<ATTRIBUTES[K]>,
        IPrimitiveDescriptorEncoded<ATTRIBUTES[K]>
      >;
    }>;
  readonly operations: IModelOperations<
    IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME, VERSION, PROPERTIES_SHAPE>
  >;
  readonly resourceJsonCodec: Schema.Codec<any, any>;
}
export type IInferResource<
  MODEL extends IModel,
  PROPERTIES_SHAPE extends IShape = MODEL['propertiesShape'],
> = IDecodedResource & IInferDecodedRow<PROPERTIES_SHAPE>;

export type IInferEncodedResource<MODEL extends IModel> = IInferEncodedRow<
  MODEL['propertiesShape']
>;

export type IInferModelRow<MODEL extends IModel> = Omit<
  IInferResource<MODEL>,
  'modelName' | 'version'
>;

export type IInferPropertiesTable<MODEL extends IModel> = IDrizzleSchema<
  MODEL['modelName'],
  MODEL['table']['shape']
>;

export type IInferAttributesSchema<MODEL extends IModel> = Schema.Codec<
  IInferDecodedRow<MODEL['attributes']>,
  IInferEncodedRow<MODEL['attributes']>
> &
  Schema.Struct<{
    [K in keyof MODEL['attributes']]: Schema.Codec<
      IPrimitiveDescriptorDecoded<MODEL['attributes'][K]>,
      IPrimitiveDescriptorEncoded<MODEL['attributes'][K]>
    >;
  }>;

export type IAnyModels = Readonly<Record<string, IModel>>;

type IModelReferenceCheck<
  DESCRIPTOR extends IPrimitiveDescriptor,
  MODELS extends IAnyModels,
  FIELD extends string,
> = DESCRIPTOR extends {
  references: {
    tableName: infer NAME extends string;
    columnName: infer COLUMN;
  };
}
  ? NAME extends keyof MODELS
    ? COLUMN extends 'id'
      ? DESCRIPTOR extends {
          kind: PrimitiveKind.Id;
          abbreviation: MODELS[NAME]['abbreviation'];
        }
        ? MODELS[NAME]['abbreviation'] extends DESCRIPTOR['abbreviation']
          ? never
          : ITypeError<`ref "${FIELD}" must retain models.${NAME} ID contract`>
        : ITypeError<`ref "${FIELD}" must retain models.${NAME} ID contract`>
      : ITypeError<`ref "${FIELD}" must name the model id column`>
    : ITypeError<`ref "${FIELD}" model is not registered on controller models`>
  : never;

export type IAssertValidModels<
  MODELS extends IAnyModels,
  ALL_MODELS extends IAnyModels = MODELS,
> = string extends keyof MODELS
  ? MODELS
  : {
        [KEY in keyof MODELS & string]: KEY extends MODELS[KEY]['modelName']
          ? MODELS[KEY]['modelName'] extends KEY
            ? {
                [ATTRIBUTE in keyof MODELS[KEY]['attributes'] &
                  string]: IModelReferenceCheck<
                  MODELS[KEY]['attributes'][ATTRIBUTE],
                  ALL_MODELS,
                  `${KEY}.${ATTRIBUTE}`
                >;
              }[keyof MODELS[KEY]['attributes'] & string]
            : ITypeError<`models key "${KEY}" must equal model.modelName`>
          : ITypeError<`models key "${KEY}" must equal model.modelName`>;
      }[keyof MODELS & string] extends infer ERROR
    ? [ERROR] extends [never]
      ? MODELS
      : ERROR
    : never;

type IRelationRefSelector<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> =
  | {
      ownRef: OWN_REF;
      connectedRef?: never;
    }
  | {
      ownRef?: never;
      connectedRef: CONNECTED_REF;
    };

export type IConnectOneRelation<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> = {
  kind: 'one';
  model: MODEL;
} & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>;

export type IConnectManyRelation<
  MODEL extends IModel = IModel,
  OWN_REF extends string = string,
  CONNECTED_REF extends keyof MODEL['attributes'] & string =
    keyof MODEL['attributes'] & string,
> = {
  kind: 'many';
  model: MODEL;
} & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>;

export type IAnyConnectRelation = IConnectOneRelation | IConnectManyRelation;

export type IRelationsByModelKey<MODELS extends Record<string, IModel>> =
  Partial<
    Record<
      keyof MODELS & string,
      {
        [key: string]: IAnyConnectRelation;
      }
    >
  >;

export type IRelationHelpers = {
  connectOne: <
    MODEL extends IModel,
    OWN_REF extends string,
    CONNECTED_REF extends keyof MODEL['attributes'] & string,
  >(
    props: {
      model: MODEL;
    } & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>,
  ) => IConnectOneRelation<MODEL, OWN_REF, CONNECTED_REF>;
  connectMany: <
    MODEL extends IModel,
    OWN_REF extends string,
    CONNECTED_REF extends keyof MODEL['attributes'] & string,
  >(
    props: {
      model: MODEL;
    } & IRelationRefSelector<MODEL, OWN_REF, CONNECTED_REF>,
  ) => IConnectManyRelation<MODEL, OWN_REF, CONNECTED_REF>;
};

/** Opaque application-chosen identifier within an aggregate name. */
export type IAggregateId = string;

/** Alias for resource id string type (e.g. \`usr_xxx\`). */
export type IResourceIdString<ABBREVIATION extends string> =
  IInferIdFromAbbreviation<ABBREVIATION>;

export type IRef = Readonly<{
  id: string;
  modelName: string;
}>;

export type IAnyResource = IDecodedResource & {
  readonly [key: string]: IPrimitive;
};
