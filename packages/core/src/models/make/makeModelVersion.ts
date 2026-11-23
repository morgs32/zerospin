import {
  captureShape,
  isAttributeDescriptor,
  makeDrizzleSchemaFromTable,
  makeShapeCodecs,
  makeTable,
  primitives,
  type IDrizzleIndexConfig,
  type IDrizzleSchema,
  type IShape,
  type ITypeError,
} from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import { mapValues, omit } from 'es-toolkit';
/* oxlint-disable typescript/no-explicit-any -- complete resolved definitions span model-specific resource shapes */

import { modelOperationDefinitions } from '../../contracts/modelOperationDefinitions.ts';
import { VersionSchema } from '../../declaration/VersionSchema.ts';
import { defineModel, Model } from '../defineModel.ts';
import type {
  IInferAttributesSchema,
  IInferProperties,
  IModel,
  IModelReservedAttributeKeys,
  IResourceShape,
} from '../types.ts';

const completedModels = new WeakSet<object>();

export function isModel(value: unknown): value is IModel {
  return value instanceof Model && completedModels.has(value);
}

type IReservedKeys =
  // Framework property keys that are not allowed as user attributes.
  | 'aggregateIndex'
  | 'createdAt'
  | 'id'
  | 'modelName'
  | 'updatedAt'
  | 'version'
  // SQLite keywords (https://sqlite.org/lang_keywords.html), lowercased.
  | 'abort'
  | 'add'
  | 'after'
  | 'all'
  | 'alter'
  | 'always'
  | 'analyze'
  | 'and'
  | 'as'
  | 'asc'
  | 'attach'
  | 'autoincrement'
  | 'before'
  | 'begin'
  | 'between'
  | 'by'
  | 'cascade'
  | 'case'
  | 'cast'
  | 'check'
  | 'collate'
  | 'column'
  | 'commit'
  | 'conflict'
  | 'constraint'
  | 'create'
  | 'cross'
  | 'current'
  | 'current_date'
  | 'current_time'
  | 'current_timestamp'
  | 'database'
  | 'default'
  | 'deferrable'
  | 'deferred'
  | 'delete'
  | 'desc'
  | 'detach'
  | 'distinct'
  | 'do'
  | 'drop'
  | 'each'
  | 'else'
  | 'end'
  | 'escape'
  | 'except'
  | 'exclude'
  | 'exclusive'
  | 'exists'
  | 'explain'
  | 'fail'
  | 'filter'
  | 'first'
  | 'following'
  | 'for'
  | 'foreign'
  | 'from'
  | 'full'
  | 'generated'
  | 'glob'
  | 'group'
  | 'groups'
  | 'having'
  | 'if'
  | 'ignore'
  | 'immediate'
  | 'in'
  | 'index'
  | 'indexed'
  | 'initially'
  | 'inner'
  | 'insert'
  | 'instead'
  | 'intersect'
  | 'into'
  | 'is'
  | 'isnull'
  | 'join'
  | 'key'
  | 'last'
  | 'left'
  | 'like'
  | 'limit'
  | 'match'
  | 'materialized'
  | 'natural'
  | 'no'
  | 'not'
  | 'nothing'
  | 'notnull'
  | 'null'
  | 'nulls'
  | 'of'
  | 'offset'
  | 'on'
  | 'or'
  | 'order'
  | 'others'
  | 'outer'
  | 'over'
  | 'partition'
  | 'plan'
  | 'pragma'
  | 'preceding'
  | 'primary'
  | 'query'
  | 'raise'
  | 'range'
  | 'recursive'
  | 'references'
  | 'regexp'
  | 'reindex'
  | 'release'
  | 'rename'
  | 'replace'
  | 'restrict'
  | 'returning'
  | 'right'
  | 'rollback'
  | 'row'
  | 'rows'
  | 'savepoint'
  | 'select'
  | 'set'
  | 'table'
  | 'temp'
  | 'temporary'
  | 'then'
  | 'ties'
  | 'to'
  | 'transaction'
  | 'trigger'
  | 'unbounded'
  | 'union'
  | 'unique'
  | 'update'
  | 'using'
  | 'vacuum'
  | 'values'
  | 'view'
  | 'virtual'
  | 'when'
  | 'where'
  | 'window'
  | 'with'
  | 'without';

const AttributeDescriptorSchema = Schema.declare(isAttributeDescriptor);

const DrizzleIndexConfigSchema = Schema.Struct({
  name: Schema.String,
  columns: Schema.NonEmptyArray(Schema.String),
  unique: Schema.optionalKey(Schema.Boolean),
  where: Schema.optionalKey(
    Schema.Struct({
      column: Schema.String,
      condition: Schema.Literals(['isNull', 'isNotNull']),
    }),
  ),
});

const MakeReleasePropsSchema = Schema.Struct({
  attributes: Schema.Record(Schema.String, AttributeDescriptorSchema),
  propertiesShape: Schema.optionalKey(
    Schema.Record(Schema.String, AttributeDescriptorSchema),
  ),
  indexes: Schema.Array(DrizzleIndexConfigSchema),
  version: VersionSchema,
});

export function makeModelVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  const VERSION extends number,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: {
    attributes: ATTRIBUTES & {
      [K in keyof ATTRIBUTES & string]: ATTRIBUTES[K] extends {
        primaryKey: true;
      }
        ? ITypeError<`Attribute "${K}" on makeVersion cannot be a primary key because makeVersion synthesizes the model id primary key`>
        : ATTRIBUTES[K];
    } & {
      [K in IReservedKeys]?: never;
    };
    indexes: readonly IDrizzleIndexConfig<
      Exclude<
        keyof IInferProperties<ATTRIBUTES, ABBREVIATION>,
        'modelName' | 'version'
      > &
        string
    >[];
    version: VERSION;
  },
): IModel<
  {
    readonly [KEY in keyof ATTRIBUTES & string]: ATTRIBUTES[KEY];
  },
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  {
    readonly [KEY in keyof IInferProperties<
      ATTRIBUTES,
      ABBREVIATION
    >]: IInferProperties<ATTRIBUTES, ABBREVIATION>[KEY];
  }
>;

export function makeModelVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  PROPERTIES_SHAPE extends IInferProperties<ATTRIBUTES, ABBREVIATION>,
  const VERSION extends number,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: {
    attributes: ATTRIBUTES & {
      [K in keyof ATTRIBUTES & string]: ATTRIBUTES[K] extends {
        primaryKey: true;
      }
        ? ITypeError<`Attribute "${K}" on makeVersion cannot be a primary key because makeVersion synthesizes the model id primary key`>
        : ATTRIBUTES[K];
    } & {
      [K in IReservedKeys]?: never;
    };
    propertiesShape: PROPERTIES_SHAPE;
    indexes: readonly IDrizzleIndexConfig<
      Exclude<keyof PROPERTIES_SHAPE, 'modelName' | 'version'> & string
    >[];
    version: VERSION;
  },
): IModel<
  {
    readonly [KEY in keyof ATTRIBUTES & string]: ATTRIBUTES[KEY];
  },
  ABBREVIATION,
  MODEL_NAME,
  VERSION,
  {
    readonly [KEY in keyof PROPERTIES_SHAPE]: PROPERTIES_SHAPE[KEY];
  }
>;

/*
 * 1. Validate authored props and compose the complete property shape.
 * 2. Build resource schemas and the table.
 * 3. Define identity helpers and exact-version resource encoding.
 * 4. Attach Drizzle and Effect schemas to the canonical Model instance.
 */
export function makeModelVersion<
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
>(
  identity: Readonly<{ name: MODEL_NAME; abbreviation: ABBREVIATION }>,
  props: {
    attributes: ATTRIBUTES;
    propertiesShape?: IShape;
    indexes: readonly IDrizzleIndexConfig<string>[];
    version: number;
  },
): unknown {
  // 1 — Strictly decode the current definition, synthesize framework fields,
  // and use an explicit propertiesShape only when the author supplied one.
  const { name: modelName, abbreviation } = defineModel(identity);
  const decodedProps = Schema.decodeUnknownSync(MakeReleasePropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const {
    attributes: decodedAttributes,
    indexes: decodedIndexes,
    version,
  } = decodedProps;
  let declaredAttributes = { ...decodedAttributes };
  const indexes = decodedIndexes.map(index => {
    const columns: typeof index.columns = [...index.columns];
    return {
      ...index,
      columns,
      ...(index.where === undefined ? {} : { where: { ...index.where } }),
    };
  });

  const standardProperties = {
    id: primitives.id({ abbreviation, primaryKey: true }),
    modelName: primitives.text({ nullable: false }),
    createdAt: primitives.date({ nullable: false }),
    updatedAt: primitives.date({ nullable: false }),
    version: primitives.integer({ nullable: false }),
  };
  const propertiesShape: IShape =
    decodedProps.propertiesShape === undefined
      ? {
          ...standardProperties,
          ...declaredAttributes,
        }
      : { ...decodedProps.propertiesShape };
  Schema.decodeUnknownSync(
    Schema.Record(Schema.String, AttributeDescriptorSchema).check(
      Schema.makeFilter((shape: Record<string, unknown>) => {
        let error: string | undefined;
        mapValues(shape, (value, key) => {
          if (!isAttributeDescriptor(value)) {
            error = `Invalid attribute descriptor for "${key}"`;
          } else if (Object.hasOwn(declaredAttributes, key)) {
            if (
              ['createdAt', 'id', 'modelName', 'updatedAt', 'version'].includes(
                key,
              )
            ) {
              error = `Invalid attribute "${key}" on model "${modelName}": framework property keys are reserved`;
            } else if (value.primaryKey === true) {
              error = `Invalid attribute "${key}" on model "${modelName}": makeVersion synthesizes the model id primary key`;
            }
          }
        });
        if (error !== undefined) return error;
        return true;
      }),
    ),
    { onExcessProperty: 'error' },
  )(propertiesShape);

  // 2 — Capture the complete scalar table without relationship rebinding.
  const table = makeTable({
    name: modelName,
    shape: omit(propertiesShape, ['modelName', 'version']),
    indexes,
  });
  declaredAttributes = mapValues(declaredAttributes, (_, key) => {
    const descriptor = table.shape[String(key)];
    if (descriptor === undefined) {
      throw new Error(
        `Model attribute ${key} is absent from its properties shape`,
      );
    }
    return descriptor;
  });
  const resolvedProperties = captureShape({
    ...propertiesShape,
    ...table.shape,
  });

  const fields: IModel = {
    abbreviation,
    attributes: declaredAttributes,
    indexes,
    modelName,
    version,
    propertiesShape: resolvedProperties,
    table,
    // 4 — Attach current table, attribute, and resource codecs before stamping
    // the canonical Model prototype; the existing casts erase generic variance.
    // ALLOWED_CAST: model-specific Drizzle table must satisfy erased IDrizzleResourceTable on IModel.
    drizzleSchema: makeDrizzleSchemaFromTable(table) as never as IDrizzleSchema<
      string,
      Omit<IResourceShape, 'modelName' | 'version'>
    >,
    // ALLOWED_CAST: makeEffectSchema return must satisfy erased IInferAttributesSchema on IModel.
    attributesSchema: makeShapeCodecs(declaredAttributes as ATTRIBUTES)
      .rowCodec as IInferAttributesSchema<
      IModel<ATTRIBUTES, ABBREVIATION, MODEL_NAME>
    >,
    resourceJsonCodec: makeShapeCodecs(
      resolvedProperties,
    ).portableCompleteCodec.check(
      Schema.makeFilter(
        resource =>
          (resource.modelName === modelName && resource.version === version) ||
          `Resource must identify ${modelName}@${version}`,
      ),
    ),
    get operations() {
      if (!isModel(model)) {
        throw new Error(
          'Model must be complete before resolving operation definitions',
        );
      }
      return modelOperationDefinitions(model);
    },
  };

  const model = new Model();
  Object.defineProperties(model, Object.getOwnPropertyDescriptors(fields));
  completedModels.add(model);
  return model;
}

export function upgradeModelVersion<
  ATTRIBUTES extends IShape,
  ABBREVIATION extends string,
  MODEL_NAME extends string,
  VERSION extends number,
  PROPERTIES_SHAPE extends IShape,
  PATCH extends Record<string, IShape[string] | null>,
  const NEXT_VERSION extends number,
>(
  previous: IModel<
    ATTRIBUTES,
    ABBREVIATION,
    MODEL_NAME,
    VERSION,
    PROPERTIES_SHAPE
  >,
  props: {
    attributes: PATCH & {
      [K in keyof PATCH]: PATCH[K] extends null
        ? K extends keyof ATTRIBUTES
          ? null
          : never
        : PATCH[K] extends { primaryKey: true }
          ? never
          : K extends IModelReservedAttributeKeys
            ? never
            : PATCH[K];
    };
    version: NEXT_VERSION;
    indexes?: readonly IDrizzleIndexConfig<
      Exclude<
        | Exclude<keyof PROPERTIES_SHAPE, keyof PATCH>
        | {
            [K in keyof PATCH]: PATCH[K] extends null ? never : K;
          }[keyof PATCH],
        'modelName' | 'version'
      > &
        string
    >[];
  },
): number extends VERSION
  ? IModel
  : IModel<
      {
        readonly [K in keyof ATTRIBUTES | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? Exclude<PATCH[K], null>
          : K extends keyof ATTRIBUTES
            ? ATTRIBUTES[K]
            : never;
      },
      ABBREVIATION,
      MODEL_NAME,
      NEXT_VERSION,
      {
        readonly [K in
          | keyof PROPERTIES_SHAPE
          | keyof PATCH as K extends keyof PATCH
          ? PATCH[K] extends null
            ? never
            : K
          : K]: K extends keyof PATCH
          ? Exclude<PATCH[K], null>
          : K extends keyof PROPERTIES_SHAPE
            ? PROPERTIES_SHAPE[K]
            : never;
      }
    >;

export function upgradeModelVersion(
  previous: IModel,
  props: {
    attributes: Record<string, IShape[string] | null>;
    version: number;
    indexes?: readonly IDrizzleIndexConfig<string>[];
  },
): unknown {
  Schema.decodeUnknownSync(Schema.declare(isModel))(previous);
  Schema.decodeUnknownSync(
    Schema.Struct({
      attributes: Schema.Record(
        Schema.String,
        Schema.NullOr(AttributeDescriptorSchema),
      ),
      version: VersionSchema,
      indexes: Schema.optionalKey(Schema.Array(DrizzleIndexConfigSchema)),
    }),
    { onExcessProperty: 'error' },
  )(props);
  const { attributes: inputAttributes, indexes, version } = props;
  const { modelName, abbreviation } = previous;
  const attributes: IShape = { ...previous.attributes };
  const nextProperties: IInferProperties<IShape> = {
    ...previous.propertiesShape,
  };
  mapValues(inputAttributes, (descriptor, key) => {
    if (descriptor === null) {
      if (!Object.hasOwn(previous.attributes, key)) {
        throw new Error(
          `Cannot remove unknown attribute "${key}" from ${modelName}`,
        );
      }
      delete attributes[key];
      delete nextProperties[key];
    } else {
      attributes[key] = descriptor;
      nextProperties[key] = descriptor;
    }
  });
  const nextIndexes = indexes ?? previous.indexes;
  for (const index of nextIndexes) {
    for (const column of index.columns) {
      if (!Object.hasOwn(nextProperties, column)) {
        throw new Error(
          `Index "${index.name}" references missing attribute "${column}"`,
        );
      }
    }
  }
  return makeModelVersion(
    { name: modelName, abbreviation },
    {
      attributes,
      propertiesShape: nextProperties,
      indexes: nextIndexes,
      version,
    },
  );
}
