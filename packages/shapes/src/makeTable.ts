import type * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

import { captureShape } from './captureDescriptor.ts';
import { makeEffectSchema } from './primitiveMaps.ts';
import { resolvePrimaryKey } from './resolvePrimaryKey.ts';
import type {
  IDrizzleIndexConfig,
  IInferDecodedRow,
  IInferEncodedRow,
  IShape,
  ITable,
} from './types.ts';

export class Table<
  TABLE_NAME extends string = string,
  SHAPE extends IShape = IShape,
> {
  declare private readonly tableBrand: void;
  readonly name: TABLE_NAME;
  readonly shape: SHAPE;
  readonly indexes: readonly IDrizzleIndexConfig<string>[];
  readonly codec: ReturnType<typeof makeEffectSchema<SHAPE>>;

  constructor(props: {
    name: TABLE_NAME;
    shape: SHAPE;
    indexes?: readonly IDrizzleIndexConfig<keyof SHAPE & string>[];
  }) {
    const { name, shape: inputShape, indexes: inputIndexes } = props;
    if (typeof name !== 'string' || name === '') {
      throw new Error('Table name must be non-empty');
    }
    const shape = captureShape(inputShape);
    const indexes = (inputIndexes ?? []).map(index => {
      if (
        index.name === '' ||
        index.columns.length === 0 ||
        index.columns.some(column => !Object.hasOwn(shape, column)) ||
        (index.where !== undefined &&
          (!Object.hasOwn(shape, index.where.column) ||
            (index.where.condition !== 'isNull' &&
              index.where.condition !== 'isNotNull')))
      ) {
        throw new Error(`Invalid index "${index.name}" on table "${name}"`);
      }
      const columns: typeof index.columns = [...index.columns];
      return {
        ...index,
        columns,
        ...(index.where === undefined ? {} : { where: { ...index.where } }),
      };
    });
    this.name = name;
    this.shape = shape;
    this.indexes = indexes;

    resolvePrimaryKey(this, false);
    this.codec = makeEffectSchema(this.shape);
  }

  decodeRow(
    row: unknown,
  ): Effect.Effect<IInferDecodedRow<SHAPE>, Schema.SchemaError> {
    return Schema.decodeUnknownEffect(this.codec)(row);
  }

  encodeRow(
    row: IInferDecodedRow<SHAPE>,
  ): Effect.Effect<IInferEncodedRow<SHAPE>, Schema.SchemaError> {
    const codec: Schema.Codec<
      IInferDecodedRow<SHAPE>,
      IInferEncodedRow<SHAPE>
    > = this.codec;
    return Schema.encodeEffect(codec)(row);
  }
}

export function makeTable<
  TABLE_NAME extends string,
  SHAPE extends IShape,
>(props: {
  name: TABLE_NAME;
  shape: SHAPE;
  indexes?: readonly IDrizzleIndexConfig<keyof SHAPE & string>[];
}): ITable<TABLE_NAME, SHAPE> {
  return new Table(props);
}
