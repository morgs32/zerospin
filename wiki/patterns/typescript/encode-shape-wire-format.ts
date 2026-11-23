import {
  PrimitiveKind,
  type IShape,
  type IEncodedShape,
} from '@zerospin/shapes';
import { Schema } from 'effect';
import { mapValues } from 'es-toolkit';

/**
 * Encode shape descriptors into the wire shape the consumer needs; do not round-trip back to IShape unless the consumer needs runtime descriptors.
 *
 * @bad Do not add `decodeShape` when the worker can consume the encoded descriptor shape directly.
 * @bad Do not send `primitives.json({ schema })` descriptors with the Effect `Schema` object across RPC.
 * Model and contract specs and definition locks use encoded primitive descriptors.
 * Only nested JSON keeps JSON Schema; date defaults serialize as ISO strings.
 *
 * @bad Do not emit a bare schema root; preserve the draft-2020-12 document metadata.
 * References are plain logical table/column/relation metadata on a scalar descriptor.
 * Source primaryKey, nullable and unique flags remain independent of scalar kind.
 * @bad Do not retain runtime Table/model objects or selected destination versions in descriptors.
 * @bad Do not transform descriptor maps with `Object.entries(...).map(...)` instead of `mapValues`.
 */
export function encodeShape(shape: IShape): IEncodedShape {
  return mapValues(shape, descriptor => {
    switch (descriptor.kind) {
      case PrimitiveKind.Json: {
        return {
          ...descriptor,
          schema: Schema.toJsonSchemaDocument(descriptor.schema),
        };
      }
      case PrimitiveKind.Date: {
        const { defaultValue, ...date } = descriptor;
        return {
          ...date,
          ...(defaultValue === undefined
            ? {}
            : { defaultValue: defaultValue.toISOString() }),
        };
      }
      case PrimitiveKind.Boolean:
      case PrimitiveKind.Cursor:
      case PrimitiveKind.Enum:
      case PrimitiveKind.Integer:
      case PrimitiveKind.Number:
      case PrimitiveKind.Id:
      case PrimitiveKind.Text: {
        return descriptor;
      }
      default: {
        throw new Error('Unsupported primitive kind');
      }
    }
  });
}
