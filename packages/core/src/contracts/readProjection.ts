import {
  captureShape,
  encodeShape,
  makeTable,
  PrimitiveKind,
  type IEncodedShape,
  type IPrimitiveDescriptor,
  type IShape,
  type ITable,
} from '@zerospin/shapes';
import * as Schema from 'effect/Schema';
import { isEqual, mapValues, pick } from 'es-toolkit';

import { isModel } from '../models/make/makeModelVersion.ts';
import type { IModel } from '../models/types.ts';

/** A contract's explicit, read-only requirement for one model. */
export type IReadProjection<MODEL extends IModel = IModel> = Readonly<{
  model: MODEL;
  fields: readonly (keyof MODEL['table']['shape'] & string)[];
}>;

export type IReadProjections = Readonly<Record<string, IReadProjection>>;

export type IAssertReadProjections<PROJECTIONS extends IReadProjections> = {
  readonly [NAME in keyof PROJECTIONS]: PROJECTIONS[NAME] & {
    readonly fields: readonly (keyof PROJECTIONS[NAME]['model']['table']['shape'] &
      string)[];
  } & (NAME extends PROJECTIONS[NAME]['model']['modelName'] ? unknown : never);
};

export type IAssertReadProjectionPatch<
  PATCH extends Readonly<Record<string, IReadProjection | null>>,
> = {
  readonly [NAME in keyof PATCH]: PATCH[NAME] extends IReadProjection
    ? IAssertReadProjections<{ [KEY in NAME]: PATCH[NAME] }>[NAME]
    : PATCH[NAME];
};

/** A query capability does not provide model mutation descriptors. */
export type IReadModel = Readonly<{
  modelName: string;
  table: IModel['table'];
}>;

export type IReadModels = Readonly<Record<string, IReadModel>>;

/** Preserve reference uniqueness only when it determines a projected inverse relation. */
export function normalizeReadField(
  descriptor: IEncodedShape[string],
  projectedModels: ReadonlySet<string>,
): IEncodedShape[string] {
  if (
    'references' in descriptor &&
    descriptor.references !== undefined &&
    projectedModels.has(descriptor.references.tableName)
  ) {
    if ('defaultValue' in descriptor) {
      const { defaultValue: _defaultValue, ...read } = descriptor;
      return read;
    }
    return descriptor;
  }
  if ('defaultValue' in descriptor) {
    const { defaultValue: _defaultValue, ...read } = descriptor;
    return { ...read, unique: false };
  }
  return { ...descriptor, unique: false };
}

function portableReadField(
  descriptor: IPrimitiveDescriptor,
  projectedModels: ReadonlySet<string>,
): IEncodedShape[string] {
  const encoded = encodeShape({ field: descriptor }).field;
  if (encoded === undefined) throw new Error('Missing encoded read field');
  return normalizeReadField(encoded, projectedModels);
}

export type IProjectedReadModels<PROJECTIONS extends IReadProjections> = {
  readonly [NAME in keyof PROJECTIONS]: Readonly<{
    modelName: PROJECTIONS[NAME]['model']['modelName'];
    table: ITable<
      PROJECTIONS[NAME]['model']['modelName'],
      Pick<
        PROJECTIONS[NAME]['model']['table']['shape'],
        Extract<
          'id' | PROJECTIONS[NAME]['fields'][number],
          keyof PROJECTIONS[NAME]['model']['table']['shape']
        >
      >
    >;
  }>;
};

/** A caller can supply additional fields without widening the shared guard. */
export type IReadProjectionRequirements<PROJECTIONS extends IReadProjections> =
  {
    readonly [NAME in keyof PROJECTIONS]: Readonly<{
      modelName: IProjectedReadModels<PROJECTIONS>[NAME]['modelName'];
      table: Readonly<{
        shape: {
          readonly [FIELD in keyof IProjectedReadModels<PROJECTIONS>[NAME]['table']['shape']]: unknown;
        };
      }>;
    }>;
  };

export type IInvalidReadProjectionNames<
  PROJECTIONS extends IReadProjections,
  MODELS extends IReadModels,
> = {
  [NAME in keyof PROJECTIONS]: NAME extends keyof MODELS
    ? Exclude<
        PROJECTIONS[NAME]['fields'][number],
        keyof MODELS[NAME]['table']['shape']
      > extends never
      ? never
      : NAME
    : NAME;
}[keyof PROJECTIONS];

export const ReadProjectionSchema = Schema.Struct({
  model: Schema.declare((input: unknown): input is IModel => isModel(input)),
  fields: Schema.Array(Schema.NonEmptyString),
});

type IReadRequirement = Readonly<{
  modelName: string;
  abbreviation: string;
  shape: IShape;
}>;
const requirements = new WeakMap<object, IReadRequirement>();

export function readProjectionRequirement(
  projection: IReadProjection,
): IReadRequirement {
  const existing = requirements.get(projection);
  if (existing !== undefined) return existing;
  const { model, fields } = projection;
  const shape = captureShape(pick(model.table.shape, ['id', ...fields]));
  mapValues(shape, descriptor => {
    if (descriptor.references !== undefined) {
      Object.freeze(descriptor.references);
    }
    if (descriptor.kind === PrimitiveKind.Enum) {
      Object.freeze(descriptor.values);
    }
    Object.freeze(descriptor);
  });
  return Object.freeze({
    modelName: model.modelName,
    abbreviation: model.abbreviation,
    shape: Object.freeze(shape),
  });
}

/** Capture only explicit, valid fields from canonical source models. */
export function captureReadProjections(input: unknown): IReadProjections {
  const decoded = Schema.decodeUnknownSync(
    Schema.Record(Schema.String, Schema.Unknown),
  )(input);
  return Object.freeze(
    mapValues(decoded, (value, name) => {
      const projection = Schema.decodeUnknownSync(ReadProjectionSchema, {
        onExcessProperty: 'error',
      })(value);
      if (name !== projection.model.modelName) {
        throw new Error(`Read projection key ${name} must match its model`);
      }
      const fields = new Set(projection.fields);
      if (fields.size !== projection.fields.length) {
        throw new Error(`Read projection ${name} contains duplicate fields`);
      }
      for (const field of fields) {
        if (!Object.hasOwn(projection.model.table.shape, field)) {
          throw new Error(
            `Read projection ${name}.${field} is not a model field`,
          );
        }
      }
      const captured = Object.freeze({
        model: projection.model,
        fields: Object.freeze([...fields].sort()),
      });
      const prior =
        typeof value === 'object' && value !== null
          ? requirements.get(value)
          : undefined;
      requirements.set(captured, prior ?? readProjectionRequirement(captured));
      return captured;
    }),
  );
}

/** Produce query-only model capabilities with the selected table shape. */
export function makeProjectedReadModels<const P extends IReadProjections>(
  projections: P,
): IProjectedReadModels<P>;
export function makeProjectedReadModels(
  projections: IReadProjections,
): IReadModels {
  return Object.freeze(
    mapValues(projections, projection => {
      const requirement = readProjectionRequirement(projection);
      const table = makeTable({
        name: requirement.modelName,
        shape: requirement.shape,
        indexes: [],
      });
      mapValues(table.shape, descriptor => {
        if (descriptor.references !== undefined) {
          Object.freeze(descriptor.references);
        }
        if (descriptor.kind === PrimitiveKind.Enum) {
          Object.freeze(descriptor.values);
        }
        Object.freeze(descriptor);
      });
      Object.freeze(table.shape);
      Object.freeze(table.indexes);
      Object.freeze(table);
      return Object.freeze({
        modelName: requirement.modelName,
        table,
      });
    }),
  );
}

/** Check a read requirement against the model selected by an owner or Actor. */
export function assertReadProjection(props: {
  projection: IReadProjection;
  projectedModels: ReadonlySet<string>;
  model: IReadModel | undefined;
  context: string;
}): void {
  const { projection, projectedModels, model, context } = props;
  const source = readProjectionRequirement(projection);
  if (model === undefined || model.modelName !== source.modelName) {
    throw new Error(`${context} read model ${source.modelName} is unavailable`);
  }
  for (const field of new Set(['id', ...projection.fields])) {
    const expected = source.shape[field];
    const actual = model.table.shape[field];
    if (
      expected === undefined ||
      actual === undefined ||
      (expected.kind === PrimitiveKind.Json &&
        (actual.kind !== PrimitiveKind.Json ||
          expected.schema !== actual.schema)) ||
      !isEqual(
        portableReadField(expected, projectedModels),
        portableReadField(actual, projectedModels),
      )
    ) {
      throw new Error(
        `${context} read field ${source.modelName}.${field} is incompatible`,
      );
    }
  }
}
