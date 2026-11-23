import * as Schema from 'effect/Schema';
import { mapValues } from 'es-toolkit';

import { compileDescriptor } from './compileDescriptor.ts';
import type {
  IInferDecodedRow,
  IInferEncodedRow,
  IInferPortableRow,
  IPrimitiveDescriptorDecoded,
  IPrimitiveDescriptorEncoded,
  IPrimitiveDescriptorPortableEncoded,
  IShape,
} from './types.ts';

type IRowCodec<SHAPE extends IShape> = Schema.Codec<
  IInferDecodedRow<SHAPE>,
  IInferEncodedRow<SHAPE>
> &
  Schema.Struct<{
    [K in keyof SHAPE]: Schema.Codec<
      IPrimitiveDescriptorDecoded<SHAPE[K]>,
      IPrimitiveDescriptorEncoded<SHAPE[K]>
    >;
  }>;

type IPortableCompleteCodec<SHAPE extends IShape> = Schema.Codec<
  IInferDecodedRow<SHAPE>,
  IInferPortableRow<SHAPE>
> &
  Schema.Struct<{
    [K in keyof SHAPE]: Schema.Codec<
      IPrimitiveDescriptorDecoded<SHAPE[K]>,
      IPrimitiveDescriptorPortableEncoded<SHAPE[K]>
    >;
  }>;

export function makeShapeCodecs<SHAPE extends IShape>(shape: SHAPE) {
  const descriptors = mapValues(shape, compileDescriptor);
  const rowCodec = Schema.Struct(
    mapValues(descriptors, descriptor => descriptor.defaultedRowCodec),
  ) as unknown as IRowCodec<SHAPE>;
  const portableCompleteCodec = Schema.Struct(
    mapValues(descriptors, descriptor => descriptor.portableCodec),
  ) as unknown as IPortableCompleteCodec<SHAPE>;
  const portablePatchCodec = Schema.Struct(
    mapValues(portableCompleteCodec.fields, Schema.optionalKey),
  );
  return {
    rowCodec,
    decodedSchema: Schema.toType(rowCodec),
    portableCompleteCodec,
    portablePatchCodec,
  };
}
